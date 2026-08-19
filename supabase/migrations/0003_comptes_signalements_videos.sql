-- Comptes proteges par code PIN, videos de seance et signalements.
--
-- Trois ajouts au schema minimal des migrations 0001/0002 :
--   1. un code PIN par pseudo, pour qu'un compte ne soit plus revendicable
--      par n'importe qui ;
--   2. une video par seance (chemin dans le bucket Storage "seances"),
--      pour verifier une performance contestee ;
--   3. des signalements : un membre conteste une seance, l'administrateur
--      tranche (recalcul du nombre de repetitions, ou annulation).
--
-- Contrairement au reste du schema (RLS entierement ouverte, tout se passe
-- cote client), les codes PIN et les decisions d'administration passent par
-- des fonctions SECURITY DEFINER : le hash du code n'est jamais lisible par
-- le client, et trancher un signalement exige le code administrateur, qui
-- est verifie par la base et pas par l'ecran.
--
-- A executer une seule fois dans Supabase (SQL Editor).

-- pgcrypto (crypt, gen_salt) est installe dans le schema "extensions" sur
-- Supabase, et dans "public" sur une installation Postgres nue. Les deux
-- sont donc dans le chemin de recherche, ici comme dans chaque fonction.
set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- 1. Comptes
-- ---------------------------------------------------------------------

alter table public.utilisateurs
  add column if not exists est_admin boolean not null default false;

-- Table volontairement sans policy : RLS activee et aucune policy signifie
-- "personne ne peut lire ni ecrire" pour les roles anon/authenticated. Les
-- seuls acces passent par les fonctions SECURITY DEFINER plus bas, qui
-- s'executent avec les droits du proprietaire de la fonction.
create table if not exists public.codes_acces (
  pseudo text primary key references public.utilisateurs (pseudo) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.codes_acces enable row level security;

-- ---------------------------------------------------------------------
-- 2. Seances : video et annulation
-- ---------------------------------------------------------------------

alter table public.historique
  add column if not exists video_path text;

-- Une seance annulee par l'administrateur reste en base (trace de la
-- decision) mais sort du classement et des statistiques.
alter table public.historique
  add column if not exists annulee boolean not null default false;

-- Nombre de repetitions d'origine, conserve quand l'administrateur
-- recalcule une seance : on doit pouvoir dire ce qui a ete corrige.
alter table public.historique
  add column if not exists repetitions_initiales integer;

create index if not exists historique_annulee_idx on public.historique (annulee);

-- ---------------------------------------------------------------------
-- 3. Signalements
-- ---------------------------------------------------------------------

create table if not exists public.signalements (
  id uuid primary key default gen_random_uuid(),
  seance_id uuid not null references public.historique (id) on delete cascade,
  auteur text not null references public.utilisateurs (pseudo) on delete cascade,
  type text not null check (type in ('recalcul', 'annulation')),
  motif text not null default '',
  repetitions_proposees integer check (repetitions_proposees is null or repetitions_proposees >= 0),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'accepte', 'refuse')),
  decision_par text,
  decision_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists signalements_statut_idx on public.signalements (statut);
create index if not exists signalements_seance_idx on public.signalements (seance_id);

alter table public.signalements enable row level security;

-- Lecture et depot libres (comme le reste du schema) : tout le groupe voit
-- les signalements en cours. Seule la DECISION est protegee, via la
-- fonction trancher_signalement.
drop policy if exists "signalements_lecture_libre" on public.signalements;
create policy "signalements_lecture_libre"
  on public.signalements for select
  to anon, authenticated
  using (true);

drop policy if exists "signalements_ecriture_libre" on public.signalements;
create policy "signalements_ecriture_libre"
  on public.signalements for insert
  to anon, authenticated
  with check (true);

-- ---------------------------------------------------------------------
-- 4. Fonctions de compte (code PIN)
--
-- Toutes en SECURITY DEFINER avec un search_path fige : elles accedent a
-- codes_acces, que le client ne peut pas lire directement.
-- ---------------------------------------------------------------------

-- Le compte existe-t-il, et a-t-il deja un code ? Renvoie une ligne unique
-- pour que l'ecran d'entree sache quoi demander (creer un code / le saisir).
create or replace function public.etat_compte(p_pseudo text)
returns table (existe boolean, a_un_code boolean, est_admin boolean)
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select
    exists (select 1 from public.utilisateurs u where u.pseudo = p_pseudo),
    exists (select 1 from public.codes_acces c where c.pseudo = p_pseudo),
    coalesce((select u.est_admin from public.utilisateurs u where u.pseudo = p_pseudo), false);
$$;

-- Cree le compte s'il n'existe pas et lui attache un code. Refuse d'ecraser
-- un code existant : changer de code demande de connaitre l'ancien
-- (voir modifier_code_pin).
create or replace function public.definir_code_pin(p_pseudo text, p_code text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
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

  insert into public.utilisateurs (pseudo) values (p_pseudo)
    on conflict (pseudo) do nothing;

  insert into public.codes_acces (pseudo, code_hash)
    values (p_pseudo, crypt(p_code, gen_salt('bf')));
end;
$$;

create or replace function public.verifier_code_pin(p_pseudo text, p_code text)
returns boolean
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from public.codes_acces c
    where c.pseudo = p_pseudo and c.code_hash = crypt(p_code, c.code_hash)
  );
$$;

create or replace function public.modifier_code_pin(p_pseudo text, p_ancien text, p_nouveau text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.verifier_code_pin(p_pseudo, p_ancien) then
    raise exception 'Code actuel incorrect';
  end if;
  if p_nouveau !~ '^[0-9]{4,6}$' then
    raise exception 'Le code doit contenir de 4 a 6 chiffres';
  end if;

  update public.codes_acces
     set code_hash = crypt(p_nouveau, gen_salt('bf'))
   where pseudo = p_pseudo;
end;
$$;

-- Un code administrateur est le code d'un compte marque est_admin. Il n'y a
-- donc aucun secret en dur dans le SQL : le code de l'administrateur est
-- celui de son compte (voir l'amorcage en fin de fichier), et il reste
-- modifiable comme n'importe quel autre.
create or replace function public.est_code_admin(p_code text)
returns boolean
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1
      from public.codes_acces c
      join public.utilisateurs u on u.pseudo = c.pseudo
     where u.est_admin and c.code_hash = crypt(p_code, c.code_hash)
  );
$$;

-- Suppression de compte : par son proprietaire (avec son code), ou par
-- l'administrateur (avec le code administrateur). Un compte sans code
-- (cree avant cette migration) peut etre supprime sans code : il n'est de
-- toute facon protege par rien.
--
-- Renvoie les chemins des videos a effacer du Storage : la base ne sait pas
-- supprimer des fichiers, c'est l'appelant qui s'en charge. Les chemins
-- sont collectes AVANT le delete, sans quoi la cascade les aurait deja
-- emportes.
create or replace function public.supprimer_compte(p_pseudo text, p_code text)
returns table (video_path text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_autorise boolean;
  v_videos text[];
begin
  v_autorise :=
    public.verifier_code_pin(p_pseudo, p_code)
    or public.est_code_admin(p_code)
    or not exists (select 1 from public.codes_acces where pseudo = p_pseudo);

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
-- 5. Administration
-- ---------------------------------------------------------------------

-- Tranche un signalement. Seul un code administrateur valide autorise
-- l'operation : c'est la base qui le verifie, pas l'ecran.
--   p_decision = 'accepte' : la demande est appliquee a la seance
--       (recalcul -> repetitions remplacees, annulation -> seance annulee)
--   p_decision = 'refuse'  : la seance reste telle quelle
create or replace function public.trancher_signalement(
  p_signalement_id uuid,
  p_decision text,
  p_repetitions integer,
  p_code_admin text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_signalement public.signalements%rowtype;
  v_admin text;
  v_reps integer;
begin
  if not public.est_code_admin(p_code_admin) then
    raise exception 'Code administrateur incorrect';
  end if;
  if p_decision not in ('accepte', 'refuse') then
    raise exception 'Decision invalide';
  end if;

  select * into v_signalement from public.signalements where id = p_signalement_id;
  if not found then
    raise exception 'Signalement introuvable';
  end if;
  if v_signalement.statut <> 'en_attente' then
    raise exception 'Signalement deja tranche';
  end if;

  select u.pseudo into v_admin
    from public.codes_acces c
    join public.utilisateurs u on u.pseudo = c.pseudo
   where u.est_admin and c.code_hash = crypt(p_code_admin, c.code_hash)
   limit 1;

  if p_decision = 'accepte' then
    if v_signalement.type = 'annulation' then
      update public.historique
         set annulee = true
       where id = v_signalement.seance_id;
    else
      v_reps := coalesce(p_repetitions, v_signalement.repetitions_proposees);
      if v_reps is null or v_reps < 0 then
        raise exception 'Nombre de repetitions invalide';
      end if;
      update public.historique
         set repetitions_initiales = coalesce(repetitions_initiales, repetitions),
             repetitions = v_reps
       where id = v_signalement.seance_id;
    end if;
  end if;

  update public.signalements
     set statut = p_decision,
         decision_par = v_admin,
         decision_at = now()
   where id = p_signalement_id;
end;
$$;

-- Suppression d'une seance par l'administrateur (menage manuel, doublon...).
create or replace function public.supprimer_seance(p_seance_id uuid, p_code_admin text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if not public.est_code_admin(p_code_admin) then
    raise exception 'Code administrateur incorrect';
  end if;
  delete from public.historique where id = p_seance_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Droits d'appel
--
-- Les fonctions SECURITY DEFINER sont executables par tout le monde par
-- defaut : on retire ce droit puis on l'accorde explicitement, pour que la
-- liste des points d'entree soit lisible ici.
-- ---------------------------------------------------------------------

revoke all on function public.etat_compte(text) from public;
revoke all on function public.definir_code_pin(text, text) from public;
revoke all on function public.verifier_code_pin(text, text) from public;
revoke all on function public.modifier_code_pin(text, text, text) from public;
revoke all on function public.supprimer_compte(text, text) from public;
revoke all on function public.est_code_admin(text) from public;
revoke all on function public.trancher_signalement(uuid, text, integer, text) from public;
revoke all on function public.supprimer_seance(uuid, text) from public;

grant execute on function public.etat_compte(text) to anon, authenticated;
grant execute on function public.definir_code_pin(text, text) to anon, authenticated;
grant execute on function public.verifier_code_pin(text, text) to anon, authenticated;
grant execute on function public.modifier_code_pin(text, text, text) to anon, authenticated;
grant execute on function public.supprimer_compte(text, text) to anon, authenticated;
grant execute on function public.trancher_signalement(uuid, text, integer, text) to anon, authenticated;
grant execute on function public.supprimer_seance(uuid, text) to anon, authenticated;

-- est_code_admin n'est volontairement PAS exposee au client : elle
-- permettrait de tester des codes administrateur un par un. Elle n'est
-- appelee que par les autres fonctions, qui s'executent en SECURITY
-- DEFINER et ne passent donc pas par ce droit.

-- ---------------------------------------------------------------------
-- 7. Amorcage du compte administrateur
--
-- Pseudo "Admin", code 2424. A changer depuis l'application (ecran
-- Administration -> Changer le code) apres la premiere connexion.
-- ---------------------------------------------------------------------

insert into public.utilisateurs (pseudo, est_admin)
  values ('Admin', true)
  on conflict (pseudo) do update set est_admin = true;

insert into public.codes_acces (pseudo, code_hash)
  values ('Admin', crypt('2424', gen_salt('bf')))
  on conflict (pseudo) do nothing;

-- ---------------------------------------------------------------------
-- 8. Bucket des videos de seance
--
-- Bucket public en lecture : l'URL d'une video est devinable par qui
-- connait le chemin, ce qui est le meme niveau d'ouverture que le reste du
-- schema (voir README, "Pourquoi pas de comptes individuels"). Les noms de
-- fichiers sont des UUID, donc non enumerables sans lire l'historique.
--
-- Si cette partie echoue (droits insuffisants sur le schema storage selon
-- les projets), creer le bucket "seances" a la main dans l'interface
-- Supabase : Storage -> New bucket -> nom "seances", coche "Public bucket".
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('seances', 'seances', true, 104857600, array['video/webm', 'video/mp4'])
  on conflict (id) do update
    set public = true,
        file_size_limit = 104857600,
        allowed_mime_types = array['video/webm', 'video/mp4'];

drop policy if exists "seances_lecture_libre" on storage.objects;
create policy "seances_lecture_libre"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'seances');

drop policy if exists "seances_depot_libre" on storage.objects;
create policy "seances_depot_libre"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'seances');

drop policy if exists "seances_suppression_libre" on storage.objects;
create policy "seances_suppression_libre"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'seances');
