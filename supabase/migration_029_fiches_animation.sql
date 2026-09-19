-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_028_auto_evaluation_stagiaire.sql. Ajoute la fiche
-- d'animation d'un grand jeu (objectifs, lieu, déroulement...),
-- remplie par le(s) animateur(s) assigné(s) depuis Mon planning —
-- inspirée des fiches "JeSuisAnimateur.fr".

create table public.fiches_animation (
  id uuid primary key default gen_random_uuid(),
  planning_activite_id uuid not null unique references public.planning_activites (id) on delete cascade,
  age text,
  effectif text,
  lieu text,
  objectifs text,
  sensibilisation text,
  deroulement text,
  conclusion_rangement text,
  animateurs_requis text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fiches_animation enable row level security;

create policy "fiches_animation: readable by any signed-in user" on public.fiches_animation
  for select using (auth.role() = 'authenticated');

-- Même droit que pour modifier l'activité liée : la direction (du
-- groupe concerné) ou un animateur assigné à cette activité.
create or replace function public.peut_modifier_fiche_animation(p_planning_activite_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.planning_activites pa
    where pa.id = p_planning_activite_id
      and (
        public.peut_gerer_groupe(pa.groupe)
        or exists (
          select 1 from public.animateurs a
          where a.profile_id = auth.uid() and a.id = any(pa.animateur_ids)
        )
      )
  );
$$;

create policy "fiches_animation: write by assigned or direction" on public.fiches_animation
  for all
  using (public.peut_modifier_fiche_animation(planning_activite_id))
  with check (public.peut_modifier_fiche_animation(planning_activite_id));

-- La durée était réservée à la direction (verrou du trigger sur
-- planning_activites) ; un animateur qui remplit sa fiche d'animation
-- doit pouvoir préciser la durée de SON grand jeu, comme il le fait
-- déjà pour le matériel.
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
    new.animateur_ids := old.animateur_ids;
  end if;
  return new;
end;
$$;
