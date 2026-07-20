-- BSE push up : schema minimal pour un groupe restreint (~10 personnes).
-- Pas de comptes individuels, pas de mot de passe par utilisateur : le
-- pseudo suffit a identifier chacun. La base est deliberement ouverte en
-- lecture et en ecriture (MVP prive) ; le seul filtre d'acces est l'ecran
-- d'entree de l'application (mot de passe de groupe verifie cote client).
--
-- A executer une seule fois dans Supabase (SQL Editor).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- utilisateurs : un pseudo suffit, pas d'email ni de mot de passe.
-- ---------------------------------------------------------------------
create table public.utilisateurs (
  pseudo text primary key,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- historique : une ligne par seance enregistree.
-- ---------------------------------------------------------------------
create table public.historique (
  id uuid primary key default gen_random_uuid(),
  pseudo text not null references public.utilisateurs (pseudo) on delete cascade,
  date date not null default current_date,
  nom_exercice text not null default 'Pompes',
  repetitions integer not null check (repetitions >= 0),
  muscles_travailles text not null default 'Pectoraux, triceps, epaules',
  created_at timestamptz not null default now()
);

create index historique_pseudo_idx on public.historique (pseudo);
create index historique_date_idx on public.historique (date);

-- ---------------------------------------------------------------------
-- RLS activee (recommande par Supabase) mais avec des policies
-- entierement ouvertes : lecture et ecriture libres pour tout le monde.
-- La protection contre les inconnus se fait uniquement cote application
-- (ecran d'entree avec mot de passe de groupe), pas au niveau de la base.
-- ---------------------------------------------------------------------
alter table public.utilisateurs enable row level security;

create policy "utilisateurs_lecture_libre"
  on public.utilisateurs for select
  to anon, authenticated
  using (true);

create policy "utilisateurs_ecriture_libre"
  on public.utilisateurs for insert
  to anon, authenticated
  with check (true);

alter table public.historique enable row level security;

create policy "historique_lecture_libre"
  on public.historique for select
  to anon, authenticated
  using (true);

create policy "historique_ecriture_libre"
  on public.historique for insert
  to anon, authenticated
  with check (true);
