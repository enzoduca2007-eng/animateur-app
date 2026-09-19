-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_026_evaluations_stagiaire.sql. Ajoute une appréciation par
-- grande catégorie de compétences (en plus de l'appréciation générale
-- globale) sur la fiche d'évaluation stagiaire.

alter table public.evaluations_stagiaire
  add column if not exists appreciations_categories jsonb not null default '{}'::jsonb;
