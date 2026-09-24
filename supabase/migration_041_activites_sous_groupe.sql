-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_040_tranches_age_libres.sql.
--
-- Sur le planning d'activités : sépare Trolls et Géants en deux blocs
-- distincts (comme la Répartition le fait déjà pour l'affichage — le
-- groupe réel reste "trolls" pour tout le reste de l'app, encadrement
-- compris), et ajoute "mettre en commun avec" pour marquer une activité
-- comme partagée avec un autre groupe (ex. un grand jeu Trolls fait avec
-- les Lutins).
--
-- Idempotente : peut être relancée sans erreur.

alter table public.planning_activites
  add column if not exists sous_groupe text check (sous_groupe in ('trolls', 'geants'));

alter table public.planning_activites
  add column if not exists commun_avec text check (commun_avec in ('lutins', 'trolls', 'geants'));
