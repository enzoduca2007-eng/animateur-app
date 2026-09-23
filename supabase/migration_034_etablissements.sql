-- Migration à exécuter SEULE (une seule requête "Run"), après
-- migration_033_publications_planning.sql et AVANT
-- migration_035_etablissements.sql.
--
-- Postgres interdit d'utiliser une valeur tout juste ajoutée par
-- ALTER TYPE ... ADD VALUE (comparaisons, policies...) tant que la
-- transaction qui l'a ajoutée n'a pas été validée — et le SQL Editor de
-- Supabase exécute tout le texte collé comme une seule transaction. D'où
-- ce fichier séparé, à exécuter d'abord et seul, avant de coller/exécuter
-- migration_035_etablissements.sql qui utilise cette nouvelle valeur.
--
-- Idempotente : peut être relancée sans erreur.

alter type public.user_role add value if not exists 'gestionnaire';
