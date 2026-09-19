-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_018_planning_activites.sql. Ajoute à chaque activité du
-- planning pédagogique une case "grand jeu", une durée libre (ex:
-- "1h30") — pas une heure précise — et le matériel nécessaire.

alter table public.planning_activites
  add column if not exists est_grand_jeu boolean not null default false;

alter table public.planning_activites
  add column if not exists duree text;

alter table public.planning_activites
  add column if not exists materiel text;
