-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_013_animateurs_directeur_only.sql. Retire aux
-- coordinateurs (même rattachés à un groupe, comme Enzo sur Lutins)
-- le droit de modifier la Répartition : c'est désormais réservé au
-- directeur uniquement, comme pour la page Animateurs.
--
-- Le Planning, les Effectifs et les Fiches horaires ne sont PAS
-- touchés par cette migration : un coordinateur restreint garde le
-- droit de les gérer pour son groupe (via peut_gerer_groupe /
-- groupe_de_ce_jour, qui lisent toujours affectations_jour).

drop policy if exists "affectations_jour: directeur/coordinateur insert" on public.affectations_jour;
drop policy if exists "affectations_jour: directeur/coordinateur update" on public.affectations_jour;
drop policy if exists "affectations_jour: directeur/coordinateur delete" on public.affectations_jour;
drop policy if exists "affectations_jour: directeur/coordinateur write" on public.affectations_jour;

create policy "affectations_jour: directeur write" on public.affectations_jour
  for all using (public.current_role_name() = 'directeur')
  with check (public.current_role_name() = 'directeur');
