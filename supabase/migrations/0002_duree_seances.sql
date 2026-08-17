-- Ajoute la duree passee sur chaque exercice a l'historique (la somme des
-- lignes d'une seance redonne la duree totale de la seance). Nullable :
-- les lignes enregistrees avant cette migration n'ont pas de duree connue.
--
-- A executer une seule fois dans Supabase (SQL Editor).

alter table public.historique
  add column if not exists duree_secondes integer
    check (duree_secondes is null or duree_secondes >= 0);
