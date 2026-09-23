-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_036_gestionnaire_parametres.sql.
--
-- Permet d'avoir un compte gestionnaire PAR établissement, en plus du
-- gestionnaire global. Contrairement à une version précédente de cette
-- migration, le gestionnaire d'un établissement NE gère PAS les mêmes
-- pages que le directeur (Plannings, Répartition, Animateurs...) — il est
-- volontairement limité aux comptes (page Comptes) et aux paramètres
-- (créneaux/paliers/fermetures déjà en place, tranches d'âge dans
-- migration_038). Les pages métier restent réservées à
-- directeur/coordinateur, comme avant.
--
-- Idempotente : peut être relancée sans erreur.

-- dans_mon_etablissement() : l'accès transverse "voit tout" ne s'applique
-- plus qu'au gestionnaire SANS établissement (le global) — un gestionnaire
-- scopé à un établissement est traité comme n'importe quel compte de cet
-- établissement (ne voit que le sien).
create or replace function public.dans_mon_etablissement(p_etablissement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_etablissement_id = public.current_etablissement_id()
    or (public.current_role_name() = 'gestionnaire' and public.current_etablissement_id() is null);
$$;

-- etablissements : seul le gestionnaire GLOBAL (sans établissement) peut
-- créer/modifier des établissements — un gestionnaire scopé ne peut pas en
-- créer d'autres.
drop policy if exists "etablissements: gestionnaire write" on public.etablissements;
create policy "etablissements: gestionnaire write" on public.etablissements
  for all
  using (public.current_role_name() = 'gestionnaire' and public.current_etablissement_id() is null)
  with check (public.current_role_name() = 'gestionnaire' and public.current_etablissement_id() is null);
