-- Durcissement des codes d'acces, suite a une relecture de la migration
-- 0003. Trois problemes y ont ete trouves, tous corriges ici.
--
--   1. Le code administrateur etait enumerable. `trancher_signalement` et
--      `supprimer_seance` sont ouvertes a anon et repondent "Code
--      administrateur incorrect" avant toute autre verification : il
--      suffisait de boucler sur un identifiant de seance bidon (donc sans
--      rien casser) pour trouver un code a 4 chiffres en 10 000 requetes.
--      Le meme raisonnement valait pour les codes des membres via
--      `verifier_code_pin`.
--      -> compteur d'echecs et blocage temporaire, applique a TOUTES les
--         verifications de code, membres comme administrateur.
--
--   2. `supprimer_compte` autorisait la suppression sans aucun justificatif
--      des que le compte n'avait pas de code. Or l'application cree des
--      comptes sans code chaque fois que la base est injoignable pendant
--      une seance, et `etat_compte` disait publiquement lesquels : il
--      suffisait de les lister pour effacer leur historique.
--      -> un compte sans code n'est supprimable sans code que s'il n'a
--         aucune seance (le cas de la faute de frappe), sinon il faut le
--         code administrateur.
--
--   3. Poser un code sur un compte existant ("adoption") permettait de
--      s'approprier le compte d'un autre. Le cas reste autorise, sans quoi
--      les comptes crees avant 0003 seraient perdus pour leur proprietaire,
--      mais il est desormais trace et l'ecran d'entree previent quand le
--      compte a deja un historique.
--
-- A executer une seule fois dans Supabase (SQL Editor), apres 0003.

set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- 1. Compteur d'echecs
-- ---------------------------------------------------------------------

alter table public.codes_acces
  add column if not exists echecs integer not null default 0,
  add column if not exists bloque_jusqu timestamptz,
  add column if not exists adopte boolean not null default false;

-- Nombre d'essais errones tolere avant blocage, et duree du blocage.
-- 5 essais / 15 minutes ramene l'enumeration d'un code a 4 chiffres a
-- plusieurs jours d'attente, tout en restant indolore pour quelqu'un qui
-- se trompe de touche.
create or replace function public.parametres_blocage()
returns table (max_echecs integer, duree interval)
language sql
immutable
as $$ select 5, interval '15 minutes'; $$;

-- Verification interne, seul endroit ou un code est compare. Toutes les
-- autres fonctions passent par elle, pour qu'aucune ne puisse etre
-- utilisee comme oracle non compte.
create or replace function public.verifier_code_interne(p_pseudo text, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_ligne public.codes_acces%rowtype;
  v_max integer;
  v_duree interval;
  v_ok boolean;
  v_echecs integer;
begin
  select * into v_ligne from public.codes_acces where pseudo = p_pseudo;
  if not found then
    return false;
  end if;

  select max_echecs, duree into v_max, v_duree from public.parametres_blocage();

  if v_ligne.bloque_jusqu is not null and v_ligne.bloque_jusqu > now() then
    raise exception 'Trop d''essais errones. Reessaie dans % minutes.',
      greatest(1, ceil(extract(epoch from (v_ligne.bloque_jusqu - now())) / 60))::integer;
  end if;

  v_ok := v_ligne.code_hash = crypt(p_code, v_ligne.code_hash);

  if v_ok then
    -- Un code juste efface l'ardoise : sinon quelques fautes de frappe
    -- etalees dans le temps finiraient par bloquer un compte legitime.
    update public.codes_acces
       set echecs = 0, bloque_jusqu = null
     where pseudo = p_pseudo;
  else
    v_echecs := v_ligne.echecs + 1;
    if v_echecs >= v_max then
      update public.codes_acces
         set echecs = 0, bloque_jusqu = now() + v_duree
       where pseudo = p_pseudo;
    else
      update public.codes_acces
         set echecs = v_echecs
       where pseudo = p_pseudo;
    end if;
  end if;

  return v_ok;
end;
$$;

create or replace function public.verifier_code_pin(p_pseudo text, p_code text)
returns boolean
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select public.verifier_code_interne(p_pseudo, p_code);
$$;

-- Chaque essai de code administrateur compte desormais dans le compteur du
-- compte administrateur : l'enumeration se heurte au meme blocage que pour
-- un membre.
create or replace function public.est_code_admin(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_admin record;
begin
  for v_admin in select pseudo from public.utilisateurs where est_admin loop
    if public.verifier_code_interne(v_admin.pseudo, p_code) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Etat d'un compte : ajoute le nombre de seances
--
-- L'ecran d'entree s'en sert pour prevenir quand on s'apprete a poser un
-- code sur un compte qui a deja un historique (donc probablement celui de
-- quelqu'un d'autre).
-- ---------------------------------------------------------------------

drop function if exists public.etat_compte(text);

create or replace function public.etat_compte(p_pseudo text)
returns table (existe boolean, a_un_code boolean, est_admin boolean, nb_seances integer)
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select
    exists (select 1 from public.utilisateurs u where u.pseudo = p_pseudo),
    exists (select 1 from public.codes_acces c where c.pseudo = p_pseudo),
    coalesce((select u.est_admin from public.utilisateurs u where u.pseudo = p_pseudo), false),
    (select count(*) from public.historique h where h.pseudo = p_pseudo)::integer;
$$;

-- ---------------------------------------------------------------------
-- 3. Pose d'un code : trace l'adoption d'un compte existant
-- ---------------------------------------------------------------------

create or replace function public.definir_code_pin(p_pseudo text, p_code text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_existait boolean;
begin
  if p_pseudo is null or btrim(p_pseudo) = '' then
    raise exception 'Pseudo requis';
  end if;
  if p_code !~ '^[0-9]{4,6}$' then
    raise exception 'Le code doit contenir de 4 a 6 chiffres';
  end if;
  if exists (select 1 from public.codes_acces where pseudo = p_pseudo) then
    raise exception 'Ce compte a deja un code';
  end if;

  v_existait := exists (select 1 from public.utilisateurs where pseudo = p_pseudo);

  insert into public.utilisateurs (pseudo) values (p_pseudo)
    on conflict (pseudo) do nothing;

  -- `adopte` distingue un compte cree de zero d'un compte repris en cours
  -- de route. Sans cette trace, une reprise abusive serait indetectable.
  insert into public.codes_acces (pseudo, code_hash, adopte)
    values (p_pseudo, crypt(p_code, gen_salt('bf')), v_existait);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Suppression de compte
-- ---------------------------------------------------------------------

create or replace function public.supprimer_compte(p_pseudo text, p_code text)
returns table (video_path text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_autorise boolean := false;
  v_a_un_code boolean;
  v_videos text[];
begin
  v_a_un_code := exists (select 1 from public.codes_acces where pseudo = p_pseudo);

  if v_a_un_code then
    v_autorise := public.verifier_code_interne(p_pseudo, p_code);
  else
    -- Compte sans code et sans aucune seance : c'est le cas de la faute de
    -- frappe ou du compte cree par erreur, rien a proteger. Teste en
    -- premier pour ne pas faire compter un essai a l'administrateur quand
    -- un membre supprime simplement son brouillon.
    v_autorise := not exists (select 1 from public.historique where pseudo = p_pseudo);
  end if;

  -- Dernier recours : l'administrateur peut supprimer n'importe quel
  -- compte. Volontairement evalue en dernier, et seulement si un code a
  -- ete fourni, pour ne pas gonfler son compteur d'echecs inutilement.
  if not v_autorise and coalesce(p_code, '') <> '' then
    v_autorise := public.est_code_admin(p_code);
  end if;

  if not v_autorise then
    raise exception 'Code incorrect';
  end if;

  select coalesce(array_agg(h.video_path), '{}')
    into v_videos
    from public.historique h
   where h.pseudo = p_pseudo and h.video_path is not null;

  delete from public.utilisateurs where pseudo = p_pseudo;

  return query select unnest(v_videos);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Droits d'appel
--
-- verifier_code_interne et parametres_blocage restent internes : les
-- exposer redonnerait l'oracle que cette migration supprime.
-- ---------------------------------------------------------------------

revoke all on function public.verifier_code_interne(text, text) from public;
revoke all on function public.parametres_blocage() from public;
revoke all on function public.est_code_admin(text) from public;
revoke all on function public.etat_compte(text) from public;
revoke all on function public.definir_code_pin(text, text) from public;
revoke all on function public.verifier_code_pin(text, text) from public;
revoke all on function public.supprimer_compte(text, text) from public;

grant execute on function public.etat_compte(text) to anon, authenticated;
grant execute on function public.definir_code_pin(text, text) to anon, authenticated;
grant execute on function public.verifier_code_pin(text, text) to anon, authenticated;
grant execute on function public.supprimer_compte(text, text) to anon, authenticated;
