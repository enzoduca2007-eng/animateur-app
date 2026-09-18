-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_011_coordinateur_groupe.sql. Corrige la répartition : un
-- coordinateur restreint doit pouvoir affecter à SON groupe un
-- animateur qui était la veille (ou même ce jour, par erreur) dans un
-- autre groupe — la version précédente le bloquait complètement dès
-- qu'une ligne existait déjà pour un autre groupe.
--
-- Nouvelle règle : il peut créer/modifier une ligne du moment que le
-- résultat final appartient à son groupe (peu importe l'ancien
-- groupe), mais ne peut pas supprimer une ligne qui appartient à un
-- groupe qui n'est pas le sien.

drop policy if exists "affectations_jour: directeur/coordinateur write" on public.affectations_jour;

create policy "affectations_jour: directeur/coordinateur insert" on public.affectations_jour
  for insert
  with check (public.peut_gerer_groupe(groupe));

create policy "affectations_jour: directeur/coordinateur update" on public.affectations_jour
  for update
  using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.peut_gerer_groupe(groupe));

create policy "affectations_jour: directeur/coordinateur delete" on public.affectations_jour
  for delete
  using (public.peut_gerer_groupe(groupe));
