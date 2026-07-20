-- BSE push up : schema minimal pour un groupe restreint (~10 personnes).
-- Pas de comptes individuels : un mot de passe de groupe unique protege
-- l'ecriture et la lecture, un pseudo texte libre identifie chaque personne
-- dans le classement partage.
--
-- A executer une seule fois dans Supabase (SQL Editor), puis mettre a jour
-- le mot de passe de groupe (derniere ligne du fichier).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Configuration : le mot de passe de groupe. Table non exposee via l'API
-- publique (RLS activee, aucune policy = acces refuse par defaut). Elle
-- n'est lue que par les fonctions security definer ci-dessous.
-- ---------------------------------------------------------------------
create table public.app_config (
  id boolean primary key default true,
  group_passcode text not null,
  constraint app_config_singleton check (id)
);

alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

-- ---------------------------------------------------------------------
-- scores : une ligne par seance enregistree.
-- ---------------------------------------------------------------------
create table public.scores (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  reps integer not null check (reps >= 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  performed_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index scores_username_idx on public.scores (username);
create index scores_performed_on_idx on public.scores (performed_on);

alter table public.scores enable row level security;
revoke all on public.scores from anon, authenticated;
-- Aucune policy : la table n'est accessible qu'a travers les fonctions
-- ci-dessous, qui verifient le mot de passe de groupe avant toute lecture
-- ou ecriture.

-- ---------------------------------------------------------------------
-- Fonctions d'acces (security definer : elles contournent la RLS mais
-- verifient elles-memes le mot de passe recu en parametre).
-- ---------------------------------------------------------------------
create function public.check_passcode(p_passcode text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_config where group_passcode = p_passcode);
$$;

create function public.submit_score(
  p_passcode text,
  p_username text,
  p_reps integer,
  p_duration_seconds integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.check_passcode(p_passcode) then
    raise exception 'Code d''acces invalide';
  end if;

  if p_username is null or length(trim(p_username)) = 0 then
    raise exception 'Pseudo requis';
  end if;

  insert into public.scores (username, reps, duration_seconds)
  values (trim(p_username), greatest(p_reps, 0), greatest(coalesce(p_duration_seconds, 0), 0));
end;
$$;

-- Classement global : total et seances par pseudo, tous visibles entre eux.
create function public.get_leaderboard(p_passcode text)
returns table (
  username text,
  total_reps bigint,
  sessions bigint,
  today_reps bigint,
  last_session timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.check_passcode(p_passcode) then
    raise exception 'Code d''acces invalide';
  end if;

  return query
    select
      s.username,
      sum(s.reps)::bigint as total_reps,
      count(*)::bigint as sessions,
      coalesce(sum(s.reps) filter (where s.performed_on = current_date), 0)::bigint as today_reps,
      max(s.created_at) as last_session
    from public.scores s
    group by s.username
    order by total_reps desc, last_session desc;
end;
$$;

-- Historique recent d'un pseudo donne (pour l'ecran d'accueil personnel).
create function public.get_user_sessions(p_passcode text, p_username text, p_limit integer default 10)
returns table (
  reps integer,
  duration_seconds integer,
  performed_on date,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.check_passcode(p_passcode) then
    raise exception 'Code d''acces invalide';
  end if;

  return query
    select s.reps, s.duration_seconds, s.performed_on, s.created_at
    from public.scores s
    where s.username = trim(p_username)
    order by s.created_at desc
    limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.check_passcode(text) to anon, authenticated;
grant execute on function public.submit_score(text, text, integer, integer) to anon, authenticated;
grant execute on function public.get_leaderboard(text) to anon, authenticated;
grant execute on function public.get_user_sessions(text, text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Dernniere etape (obligatoire) : definir le mot de passe de groupe reel.
-- Remplacer 'change-me' puis executer cette ligne separement.
-- ---------------------------------------------------------------------
insert into public.app_config (id, group_passcode) values (true, 'change-me')
on conflict (id) do update set group_passcode = excluded.group_passcode;
