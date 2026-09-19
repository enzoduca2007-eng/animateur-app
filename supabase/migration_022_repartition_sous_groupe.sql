-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_021_activites_type.sql. Ajoute une sous-étiquette
-- purement visuelle sur la Répartition pour distinguer Trolls de
-- Géants (saisie L/T/G) — ne change rien ailleurs : le reste de
-- l'application continue de traiter les deux comme un seul groupe
-- réel "trolls" (staffing, effectifs, goûters, scoping coordinateur,
-- Planning/Activités...).

alter table public.affectations_jour
  add column if not exists sous_groupe text
    check (sous_groupe in ('trolls', 'geants'));
