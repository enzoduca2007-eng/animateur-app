-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_010_feuilles_temps.sql. Permet de rattacher un
-- coordinateur à un seul groupe (tranche d'âge) : il ne peut alors
-- gérer la répartition, le planning, les effectifs et les fiches
-- horaires QUE de ce groupe. Un coordinateur sans groupe assigné
-- garde l'accès complet (comportement actuel inchangé).
--
-- Ne touche pas aux animateurs (fiches du personnel) ni aux réglages
-- globaux (créneaux, paliers d'encadrement, jours de fermeture) :
-- ça reste géré par n'importe quel directeur/coordinateur.

alter table public.profiles
  add column if not exists groupe_coordinateur text
    check (groupe_coordinateur in ('lutins', 'trolls', 'geants'));

-- Empêche aussi un non-directeur de retirer sa propre restriction de
-- groupe (la policy "self can update own row" ne limite pas les
-- colonnes, seul ce trigger protège role ET groupe_coordinateur).
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role_name() <> 'directeur' then
    if new.role is distinct from old.role then
      new.role := old.role;
    end if;
    if new.groupe_coordinateur is distinct from old.groupe_coordinateur then
      new.groupe_coordinateur := old.groupe_coordinateur;
    end if;
  end if;
  return new;
end;
$$;

-- Groupe auquel le coordinateur connecté est rattaché (null = pas de
-- restriction, y compris pour un directeur).
create or replace function public.mon_groupe_coordinateur()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select groupe_coordinateur from public.profiles where id = auth.uid();
$$;

-- Le groupe auquel un animateur est affecté un jour donné (via la
-- Répartition), pour vérifier le droit d'un coordinateur restreint
-- sur des tables qui n'ont pas de colonne "groupe" directe.
create or replace function public.groupe_de_ce_jour(p_animateur_id uuid, p_date date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select groupe from public.affectations_jour
  where animateur_id = p_animateur_id and date = p_date
  limit 1;
$$;

-- Vrai si l'utilisateur connecté a le droit de gérer une ligne
-- rattachée au groupe p_groupe : toujours vrai pour un directeur,
-- vrai pour un coordinateur non restreint, vrai pour un coordinateur
-- restreint seulement si p_groupe correspond à son groupe.
create or replace function public.peut_gerer_groupe(p_groupe text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_role_name() = 'directeur'
    or (
      public.current_role_name() = 'coordinateur'
      and (
        public.mon_groupe_coordinateur() is null
        or public.mon_groupe_coordinateur() = p_groupe
      )
    );
$$;

-- Répartition (a une colonne groupe directe).
drop policy if exists "affectations_jour: directeur/coordinateur write" on public.affectations_jour;
create policy "affectations_jour: directeur/coordinateur write" on public.affectations_jour
  for all using (public.peut_gerer_groupe(groupe))
  with check (public.peut_gerer_groupe(groupe));

-- Effectifs du jour (a une colonne groupe directe).
drop policy if exists "effectifs_jour: directeur/coordinateur write" on public.effectifs_jour;
create policy "effectifs_jour: directeur/coordinateur write" on public.effectifs_jour
  for all using (public.peut_gerer_groupe(groupe))
  with check (public.peut_gerer_groupe(groupe));

-- Planning (pas de colonne groupe directe : on la déduit de la
-- répartition de l'animateur ce jour-là).
drop policy if exists "affectations_creneau: directeur/coordinateur write" on public.affectations_creneau;
create policy "affectations_creneau: directeur/coordinateur write" on public.affectations_creneau
  for all using (
    public.peut_gerer_groupe(public.groupe_de_ce_jour(animateur_id, date))
  )
  with check (
    public.peut_gerer_groupe(public.groupe_de_ce_jour(animateur_id, date))
  );

-- Fiches horaires (idem, groupe déduit de la répartition du jour).
drop policy if exists "feuilles_temps: directeur/coordinateur write" on public.feuilles_temps;
create policy "feuilles_temps: directeur/coordinateur write" on public.feuilles_temps
  for all using (
    public.peut_gerer_groupe(public.groupe_de_ce_jour(animateur_id, date))
  )
  with check (
    public.peut_gerer_groupe(public.groupe_de_ce_jour(animateur_id, date))
  );
