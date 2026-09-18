-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_012_repartition_claim.sql. Retire aux coordinateurs le
-- droit de créer/modifier/supprimer une fiche animateur (personnel) :
-- seul le directeur peut gérer la page Animateurs désormais. Un
-- coordinateur garde uniquement la lecture (répartition, planning,
-- effectifs, fiches horaires ne sont pas touchés par cette migration).

drop policy if exists "animateurs: directeur/coordinateur write" on public.animateurs;

create policy "animateurs: directeur write" on public.animateurs
  for all using (public.current_role_name() = 'directeur')
  with check (public.current_role_name() = 'directeur');
