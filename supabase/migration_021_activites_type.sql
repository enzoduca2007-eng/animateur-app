-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_020_activites_materiel_animateur.sql. Remplace la case
-- "grand jeu" (booléenne) par un type d'activité à choisir : Grand
-- jeu, Activité manuelle, Jeu, ou Autre.

alter table public.planning_activites
  add column if not exists type_activite text
    check (type_activite in ('grand_jeu', 'manuelle', 'jeu', 'autre'));

update public.planning_activites
  set type_activite = 'grand_jeu'
  where est_grand_jeu = true;

alter table public.planning_activites drop column if exists est_grand_jeu;

-- Le trigger verrouillant les champs admin référence maintenant
-- type_activite au lieu de est_grand_jeu.
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
    new.type_activite := old.type_activite;
    new.duree := old.duree;
    new.animateur_ids := old.animateur_ids;
  end if;
  return new;
end;
$$;
