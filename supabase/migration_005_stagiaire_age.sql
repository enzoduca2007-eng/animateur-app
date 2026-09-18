-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_004_jours_fermeture.sql. Ajoute le statut stagiaire et la
-- date de naissance de chaque animateur, nécessaires pour les alertes
-- du planning (stagiaire seul à l'ouverture/fermeture, plafond
-- d'heures mineur/majeur).

alter table public.animateurs add column if not exists est_stagiaire boolean not null default false;
alter table public.animateurs add column if not exists date_naissance date;
