-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_041_activites_sous_groupe.sql.
--
-- "Mettre en commun avec" passe d'une seule valeur à plusieurs possibles
-- (ex. une activité Trolls en commun avec Lutins ET Géants à la fois).
--
-- Idempotente : peut être relancée sans erreur.

alter table public.planning_activites drop constraint if exists planning_activites_commun_avec_check;

alter table public.planning_activites
  alter column commun_avec type text[]
  using case when commun_avec is null then '{}'::text[] else array[commun_avec] end;

alter table public.planning_activites alter column commun_avec set default '{}';
update public.planning_activites set commun_avec = '{}' where commun_avec is null;
alter table public.planning_activites alter column commun_avec set not null;

alter table public.planning_activites drop constraint if exists planning_activites_commun_avec_valides;
alter table public.planning_activites
  add constraint planning_activites_commun_avec_valides
  check (commun_avec <@ array['lutins', 'trolls', 'geants']::text[]);
