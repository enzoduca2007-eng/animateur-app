-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_024_repartition_sections_effectifs.sql. Ajoute :
-- - le rôle "directeur_adjoint" (Directeur adjoint) à direction_roster,
--   en plus de directeur/coordinateur ;
-- - la saisie D (Directeur) / A (Directeur adjoint) directement dans la
--   grille de Répartition, comme L/T/G pour les groupes — stockée dans
--   une nouvelle table presence_direction_jour car un directeur
--   n'appartient à aucun groupe réel (contrainte groupe sur
--   affectations_jour limitée à lutins/trolls).

alter table public.direction_roster
  drop constraint if exists direction_roster_role_affiche_check;

alter table public.direction_roster
  add constraint direction_roster_role_affiche_check
  check (role_affiche in ('directeur', 'directeur_adjoint', 'coordinateur'));

drop table if exists public.presence_direction_jour cascade;

create table public.presence_direction_jour (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  animateur_id uuid not null references public.animateurs (id) on delete cascade,
  role text not null check (role in ('directeur', 'adjoint')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (date, animateur_id)
);

alter table public.presence_direction_jour enable row level security;

create policy "presence_direction_jour: readable by any signed-in user" on public.presence_direction_jour
  for select using (auth.role() = 'authenticated');

create policy "presence_direction_jour: directeur write" on public.presence_direction_jour
  for all
  using (public.current_role_name() = 'directeur')
  with check (public.current_role_name() = 'directeur');
