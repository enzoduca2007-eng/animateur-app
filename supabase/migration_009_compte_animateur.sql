-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_008_stagiaire_confiance.sql. Ajoute un 4e espace "Animateur"
-- : un compte qui peut se connecter et consulter uniquement son propre
-- planning. Un directeur/coordinateur relie ensuite ce compte à la
-- fiche animateur correspondante depuis la page Animateurs.
--
-- Exécute ce script en DEUX FOIS si Supabase affiche une erreur du type
-- "unsafe use of new value" : lance d'abord juste la ligne
-- "alter type ... add value", valide, puis relance le reste.

alter type public.user_role add value if not exists 'animateur';

alter table public.animateurs
  add column if not exists profile_id uuid unique references public.profiles (id) on delete set null;
