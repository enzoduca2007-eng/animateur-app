-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_031_verrous_planning.sql. Permet au directeur de verrouiller
-- la fiche d'évaluation d'un stagiaire une fois le bilan finalisé : plus
-- aucune modification (critères, appréciations, avis final) n'est
-- possible tant que la fiche n'est pas déverrouillée.

alter table public.evaluations_stagiaire
  add column if not exists verrouille boolean not null default false;

alter table public.evaluations_stagiaire
  add column if not exists verrouille_par uuid references public.profiles (id);

alter table public.evaluations_stagiaire
  add column if not exists verrouille_at timestamptz;
