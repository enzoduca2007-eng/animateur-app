-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_019_activites_heure.sql. Permet à un animateur assigné à
-- une activité de la mettre à jour pour renseigner le matériel de SA
-- propre activité — un trigger l'empêche de toucher à autre chose
-- (date, groupe, moment, ordre, libellé, grand jeu, durée, animateurs
-- assignés restent réservés au directeur/coordinateur).

create or replace function public.est_dans_activite(p_animateur_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.animateurs a
    where a.profile_id = auth.uid() and a.id = any(p_animateur_ids)
  );
$$;

create or replace function public.planning_activites_verrouille_champs_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.peut_gerer_groupe(old.groupe) then
    new.date := old.date;
    new.groupe := old.groupe;
    new.moment := old.moment;
    new.ordre := old.ordre;
    new.libelle := old.libelle;
    new.est_grand_jeu := old.est_grand_jeu;
    new.duree := old.duree;
    new.animateur_ids := old.animateur_ids;
  end if;
  return new;
end;
$$;

drop trigger if exists planning_activites_before_update on public.planning_activites;
create trigger planning_activites_before_update
  before update on public.planning_activites
  for each row execute procedure public.planning_activites_verrouille_champs_admin();

drop policy if exists "planning_activites: update" on public.planning_activites;
create policy "planning_activites: update" on public.planning_activites
  for update
  using (public.peut_gerer_groupe(groupe) or public.est_dans_activite(animateur_ids))
  with check (public.peut_gerer_groupe(groupe) or public.est_dans_activite(animateur_ids));
