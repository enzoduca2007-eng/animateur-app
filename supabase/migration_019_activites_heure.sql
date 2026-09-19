-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_018_planning_activites.sql. Ajoute une heure optionnelle
-- à chaque activité du planning pédagogique.

alter table public.planning_activites add column if not exists heure time;
