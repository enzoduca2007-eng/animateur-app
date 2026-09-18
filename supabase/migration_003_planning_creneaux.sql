-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_002_groupes.sql. Remplace l'ancien planning "activités
-- libres" par une grille de créneaux horaires (arrivées / pauses /
-- départs) configurables, avec calcul automatique des heures
-- travaillées par animateur.

drop table if exists public.planning_animateurs;
drop table if exists public.plannings;

create table public.creneaux (
  id uuid primary key default gen_random_uuid(),
  libelle text not null,
  type text not null check (type in ('arrivee', 'pause', 'depart')),
  heure_debut time not null,
  heure_fin time, -- requis pour les créneaux de type "pause"
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.creneaux enable row level security;

create policy "creneaux: readable by any signed-in user" on public.creneaux
  for select using (auth.role() = 'authenticated');

create policy "creneaux: directeur/coordinateur write" on public.creneaux
  for all using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));

-- Créneaux par défaut, à modifier/compléter depuis l'appli.
insert into public.creneaux (libelle, type, heure_debut, heure_fin, ordre) values
  ('7h20', 'arrivee', '07:20', null, 1),
  ('8h', 'arrivee', '08:00', null, 2),
  ('8h30', 'arrivee', '08:30', null, 3),
  ('11h30-12h30', 'pause', '11:30', '12:30', 1),
  ('12h30-13h30', 'pause', '12:30', '13:30', 2),
  ('13h-14h', 'pause', '13:00', '14:00', 3),
  ('13h30-14h30', 'pause', '13:30', '14:30', 4),
  ('17h', 'depart', '17:00', null, 1),
  ('17h30', 'depart', '17:30', null, 2),
  ('Fermeture 18h', 'depart', '18:00', null, 3),
  ('Fermeture 18h30', 'depart', '18:30', null, 4);

create table public.affectations_creneau (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  creneau_id uuid not null references public.creneaux (id) on delete cascade,
  animateur_id uuid not null references public.animateurs (id) on delete cascade,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (date, creneau_id, animateur_id)
);

alter table public.affectations_creneau enable row level security;

create policy "affectations_creneau: readable by any signed-in user" on public.affectations_creneau
  for select using (auth.role() = 'authenticated');

create policy "affectations_creneau: directeur/coordinateur write" on public.affectations_creneau
  for all using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));
