-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_023_presence_formation.sql. Ajoute, pour la feuille de
-- présence imprimable de la Répartition uniquement :
-- - des effectifs enfants séparés Trolls / Géants (effectifs_jour
--   reste la seule donnée utilisée par le calcul du taux d'encadrement
--   sur Planning, inchangée) ;
-- - le rattachement d'une fiche animateur à un rôle affiché (Directeur/
--   Coordinateur) et, pour un coordinateur, une section (Lutins/Trolls/
--   Géants) — indépendant d'un compte utilisateur, pour pouvoir ajouter
--   quelqu'un sans qu'il ait besoin de créer de compte. Sans effet sur
--   les droits réels de l'application.
--
-- Idempotente : peut être relancée sans erreur même si une exécution
-- précédente (partielle ou avec l'ancien schéma) a déjà créé ces tables.

drop table if exists public.effectifs_sous_groupe cascade;

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

-- Supprime la version précédente (basée sur profile_id, exigeait un
-- compte, ou toute exécution antérieure de cette migration) avant de
-- recréer avec le schéma final.
drop table if exists public.direction_roster cascade;

create table public.direction_roster (
  id uuid primary key default gen_random_uuid(),
  animateur_id uuid not null unique references public.animateurs (id) on delete cascade,
  role_affiche text not null check (role_affiche in ('directeur', 'coordinateur')),
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
