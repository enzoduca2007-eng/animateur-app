-- Un roulant/inclusif (presence_direction_jour, pas affectations_jour)
-- n'a pas de groupe réel ce jour-là : groupe_de_ce_jour() renvoie null,
-- et peut_gerer_groupe(null) refuse tout coordinateur restreint à un
-- groupe (seul un directeur ou un coordinateur non restreint passait).
-- Comme un roulant/inclusif peut ouvrir/fermer aussi bien chez les
-- Lutins que chez Trolls & Géants, on laisse n'importe quel
-- directeur/coordinateur gérer ses affectations_creneau.
drop policy if exists "affectations_creneau: directeur/coordinateur write" on public.affectations_creneau;
create policy "affectations_creneau: directeur/coordinateur write" on public.affectations_creneau
  for all
  using (
    (
      (
        public.groupe_de_ce_jour(animateur_id, date) is null
        and public.current_role_name() in ('directeur', 'coordinateur')
      )
      or public.peut_gerer_groupe(public.groupe_de_ce_jour(animateur_id, date))
    )
    and public.dans_mon_etablissement(etablissement_id)
  )
  with check (
    (
      (
        public.groupe_de_ce_jour(animateur_id, date) is null
        and public.current_role_name() in ('directeur', 'coordinateur')
      )
      or public.peut_gerer_groupe(public.groupe_de_ce_jour(animateur_id, date))
    )
    and public.dans_mon_etablissement(etablissement_id)
  );
