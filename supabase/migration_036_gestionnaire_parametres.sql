-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_035_etablissements.sql. Permet au gestionnaire de gérer les
-- créneaux, paliers d'encadrement et jours de fermeture de N'IMPORTE QUEL
-- établissement (page /dashboard/etablissements/[id]) — jusqu'ici ces
-- policies n'autorisaient que directeur/coordinateur de LEUR propre
-- établissement (dans_mon_etablissement() couvre déjà le "n'importe quel
-- établissement" pour un gestionnaire, il manquait juste le rôle dans la
-- condition).
--
-- Idempotente : peut être relancée sans erreur.

drop policy if exists "creneaux: directeur/coordinateur write" on public.creneaux;
create policy "creneaux: directeur/coordinateur write" on public.creneaux
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'coordinateur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id));

drop policy if exists "paliers_encadrement: directeur/coordinateur write" on public.paliers_encadrement;
create policy "paliers_encadrement: directeur/coordinateur write" on public.paliers_encadrement
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'coordinateur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id));

drop policy if exists "jours_fermeture: directeur/coordinateur write" on public.jours_fermeture;
create policy "jours_fermeture: directeur/coordinateur write" on public.jours_fermeture
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'coordinateur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id));
