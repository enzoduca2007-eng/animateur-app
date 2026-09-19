-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_017_fusion_trolls_geants.sql. Ajoute le planning
-- d'activités pédagogiques : pour un groupe, un jour et un moment
-- (matin / temps calme / après-midi), une liste d'activités, chacune
-- assignable à un ou plusieurs animateurs, plus un thème de la semaine
-- par groupe (affiché en bulle sur le planning imprimé).

create table public.planning_activites (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  groupe text not null check (groupe in ('lutins', 'trolls')),
  moment text not null check (moment in ('matin', 'temps_calme', 'apres_midi')),
  ordre integer not null default 0,
  libelle text not null,
  animateur_ids uuid[] not null default '{}',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index planning_activites_date_groupe_idx
  on public.planning_activites (date, groupe, moment, ordre);

alter table public.planning_activites enable row level security;

create policy "planning_activites: readable by any signed-in user" on public.planning_activites
  for select using (auth.role() = 'authenticated');

create policy "planning_activites: insert" on public.planning_activites
  for insert with check (public.peut_gerer_groupe(groupe));

create policy "planning_activites: update" on public.planning_activites
  for update
  using (public.peut_gerer_groupe(groupe))
  with check (public.peut_gerer_groupe(groupe));

create policy "planning_activites: delete" on public.planning_activites
  for delete using (public.peut_gerer_groupe(groupe));

create table public.themes_semaine (
  id uuid primary key default gen_random_uuid(),
  groupe text not null check (groupe in ('lutins', 'trolls')),
  semaine_debut date not null,
  theme text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (groupe, semaine_debut)
);

alter table public.themes_semaine enable row level security;

create policy "themes_semaine: readable by any signed-in user" on public.themes_semaine
  for select using (auth.role() = 'authenticated');

create policy "themes_semaine: write" on public.themes_semaine
  for all
  using (public.peut_gerer_groupe(groupe))
  with check (public.peut_gerer_groupe(groupe));
