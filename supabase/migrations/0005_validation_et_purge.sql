-- Validation des seances par le groupe, et purge des videos.
--
-- Une video ne sert qu'a trancher un desaccord. Passe le delai pendant
-- lequel une seance peut etre contestee, elle n'a plus d'utilite et ne fait
-- que remplir le Storage (1 Go sur le plan gratuit, quelques Mo par
-- seance). On lui donne donc une duree de vie.
--
-- Une seance est CLOSE quand elle n'est plus contestable :
--   - soit 7 jours ont passe,
--   - soit assez de membres l'ont validee explicitement (bouton "Je
--     valide"), ce qui permet de clore plus vite sans attendre le delai,
--   - et dans les deux cas, aucun signalement n'est en attente : une
--     seance contestee garde sa video tant que l'administrateur n'a pas
--     tranche, sinon la preuve disparaitrait au moment ou elle sert.
--
-- Une seance close garde son score et son historique pour toujours : seule
-- la video est effacee.
--
-- A executer une seule fois dans Supabase (SQL Editor), apres 0004.

set search_path = public, extensions;

-- ---------------------------------------------------------------------
-- 1. Reglages
-- ---------------------------------------------------------------------

create or replace function public.parametres_cloture()
returns table (delai interval, validations_requises integer)
language sql
immutable
as $$ select interval '7 days', 2; $$;

-- ---------------------------------------------------------------------
-- 2. Validations
-- ---------------------------------------------------------------------

create table if not exists public.validations (
  seance_id uuid not null references public.historique (id) on delete cascade,
  auteur text not null references public.utilisateurs (pseudo) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (seance_id, auteur)
);

create index if not exists validations_seance_idx on public.validations (seance_id);

alter table public.validations enable row level security;

-- Lecture libre : chacun voit qui a valide quoi. L'ecriture passe par
-- valider_seance, qui interdit de valider sa propre seance.
drop policy if exists "validations_lecture_libre" on public.validations;
create policy "validations_lecture_libre"
  on public.validations for select
  to anon, authenticated
  using (true);

-- Valide une seance au nom d'un membre. Idempotent : valider deux fois ne
-- compte qu'une voix (cle primaire sur le couple).
create or replace function public.valider_seance(p_seance_id uuid, p_auteur text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_proprietaire text;
begin
  select pseudo into v_proprietaire from public.historique where id = p_seance_id;
  if not found then
    raise exception 'Seance introuvable';
  end if;

  -- Valider sa propre performance n'aurait aucun sens : c'est le regard
  -- des autres qui fait foi.
  if v_proprietaire = p_auteur then
    raise exception 'On ne valide pas sa propre seance';
  end if;

  if not exists (select 1 from public.utilisateurs where pseudo = p_auteur) then
    raise exception 'Compte inconnu';
  end if;

  insert into public.validations (seance_id, auteur)
    values (p_seance_id, p_auteur)
    on conflict (seance_id, auteur) do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Cloture
-- ---------------------------------------------------------------------

alter table public.historique
  add column if not exists video_purgee boolean not null default false;

-- Une seance est-elle close ? Fonction interne (jamais exposee), utilisee
-- par la purge et par la confirmation de purge, pour que les deux ne
-- puissent pas diverger.
create or replace function public.seance_close(p_seance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select
    exists (
      select 1
        from public.historique h
       where h.id = p_seance_id
         and (
           h.created_at < now() - (select delai from public.parametres_cloture())
           or (select count(*) from public.validations v where v.seance_id = h.id)
              >= (select validations_requises from public.parametres_cloture())
         )
    )
    -- Un signalement en attente gele la cloture : la video doit survivre
    -- jusqu'a la decision de l'administrateur.
    and not exists (
      select 1 from public.signalements s
       where s.seance_id = p_seance_id and s.statut = 'en_attente'
    );
$$;

-- ---------------------------------------------------------------------
-- 4. Purge des videos
--
-- La base ne sait pas supprimer un fichier du Storage : elle se contente
-- de designer les videos a effacer, l'application les supprime, puis
-- confirme. En deux temps, pour qu'une interruption entre les deux ne
-- perde pas le chemin du fichier - la purge le reproposera simplement au
-- passage suivant.
-- ---------------------------------------------------------------------

create or replace function public.videos_a_purger(p_limite integer default 50)
returns table (id uuid, video_path text)
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select h.id, h.video_path
    from public.historique h
   where h.video_path is not null
     and public.seance_close(h.id)
   order by h.created_at
   limit greatest(1, least(coalesce(p_limite, 50), 200));
$$;

-- Detache les videos effectivement supprimees. La condition de cloture est
-- reverifiee ici : sans ca, n'importe qui pourrait appeler cette fonction
-- pour faire disparaitre la preuve d'une seance encore contestable.
create or replace function public.confirmer_purge_videos(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_total integer;
begin
  update public.historique h
     set video_path = null,
         video_purgee = true
   where h.id = any(coalesce(p_ids, '{}'))
     and h.video_path is not null
     and public.seance_close(h.id);

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Droits d'appel
--
-- seance_close et parametres_cloture restent internes.
-- ---------------------------------------------------------------------

revoke all on function public.parametres_cloture() from public;
revoke all on function public.seance_close(uuid) from public;
revoke all on function public.valider_seance(uuid, text) from public;
revoke all on function public.videos_a_purger(integer) from public;
revoke all on function public.confirmer_purge_videos(uuid[]) from public;

grant execute on function public.valider_seance(uuid, text) to anon, authenticated;
grant execute on function public.videos_a_purger(integer) to anon, authenticated;
grant execute on function public.confirmer_purge_videos(uuid[]) to anon, authenticated;
