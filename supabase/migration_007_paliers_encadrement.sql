-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_006_effectifs.sql (même si celle-ci vient d'être exécutée).
-- Remplace le taux d'encadrement unique (ratio) par des paliers
-- configurables : "à partir de X enfants, il faut Y animateurs à
-- l'ouverture/fermeture" — plus proche de la réalité (arrivées
-- échelonnées) qu'une simple division.

drop table if exists public.reglages;

create table public.paliers_encadrement (
  id uuid primary key default gen_random_uuid(),
  effectif_min integer not null unique,
  nb_animateurs integer not null check (nb_animateurs >= 1),
  created_at timestamptz not null default now()
);

alter table public.paliers_encadrement enable row level security;

create policy "paliers_encadrement: readable by any signed-in user" on public.paliers_encadrement
  for select using (auth.role() = 'authenticated');

create policy "paliers_encadrement: directeur/coordinateur write" on public.paliers_encadrement
  for all using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));

insert into public.paliers_encadrement (effectif_min, nb_animateurs) values
  (0, 1),
  (16, 2),
  (31, 3);
