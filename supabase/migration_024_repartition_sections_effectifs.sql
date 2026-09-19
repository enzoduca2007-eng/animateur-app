-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_023_presence_formation.sql. Ajoute, pour la feuille de
-- présence imprimable de la Répartition uniquement :
-- - des effectifs enfants séparés Trolls / Géants (effectifs_jour
--   reste la seule donnée utilisée par le calcul du taux d'encadrement
--   sur Planning, inchangée) ;
-- - le rattachement d'un directeur/coordinateur à une section (pour le
--   placer au bon endroit sur la feuille), sans toucher à ses droits
--   réels (toujours basés sur groupe_coordinateur, groupe fusionné).

create table public.effectifs_sous_groupe (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  sous_groupe text not null check (sous_groupe in ('trolls', 'geants')),
  effectif integer not null check (effectif >= 0),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (date, sous_groupe)
);

alter table public.effectifs_sous_groupe enable row level security;

create policy "effectifs_sous_groupe: readable by any signed-in user" on public.effectifs_sous_groupe
  for select using (auth.role() = 'authenticated');

create policy "effectifs_sous_groupe: directeur write" on public.effectifs_sous_groupe
  for all
  using (public.current_role_name() = 'directeur')
  with check (public.current_role_name() = 'directeur');

create table public.direction_roster (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  section text check (section in ('lutins', 'trolls', 'geants')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.direction_roster enable row level security;

create policy "direction_roster: readable by any signed-in user" on public.direction_roster
  for select using (auth.role() = 'authenticated');

create policy "direction_roster: directeur write" on public.direction_roster
  for all
  using (public.current_role_name() = 'directeur')
  with check (public.current_role_name() = 'directeur');
