-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_007_paliers_encadrement.sql. Permet de marquer un stagiaire
-- comme "de confiance" : il peut alors ouvrir/fermer seul, sans qu'une
-- alerte se déclenche ni que la répartition automatique lui impose
-- systématiquement la présence d'un non-stagiaire.

alter table public.animateurs
  add column if not exists stagiaire_confiance boolean not null default false;
