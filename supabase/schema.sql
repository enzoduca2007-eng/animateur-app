-- Schema for the Animateur management app.
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).

create extension if not exists "pgcrypto";

create type public.user_role as enum ('directeur', 'coordinateur', 'responsable');

-- One row per account, created automatically on signup (see trigger below).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.user_role not null default 'responsable',
  created_at timestamptz not null default now()
);

-- Reads the caller's own role. security definer lets it bypass profiles' RLS
-- so it can be used safely inside other tables' policies without recursion.
create or replace function public.current_role_name()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Auto-create a profile when someone signs up. full_name/role come from the
-- options.data passed to supabase.auth.signUp() on the signup form.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'responsable')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Prevent a non-directeur from promoting themselves by editing their own row.
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and public.current_role_name() <> 'directeur' then
    new.role := old.role;
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_escalation
  before update on public.profiles
  for each row execute procedure public.prevent_role_self_escalation();

alter table public.profiles enable row level security;

create policy "profiles: readable by any signed-in user" on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "profiles: self can update own row" on public.profiles
  for update using (auth.uid() = id);

create policy "profiles: directeur manages all rows" on public.profiles
  for all using (public.current_role_name() = 'directeur')
  with check (public.current_role_name() = 'directeur');

-- Animateurs (the staff being scheduled, not the app accounts).
create table public.animateurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  prenom text not null,
  email text,
  telephone text,
  diplomes text,
  disponibilites text,
  statut text not null default 'actif',
  est_stagiaire boolean not null default false,
  date_naissance date,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.animateurs enable row level security;

create policy "animateurs: readable by any signed-in user" on public.animateurs
  for select using (auth.role() = 'authenticated');

create policy "animateurs: directeur/coordinateur write" on public.animateurs
  for all using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));

-- Créneaux horaires configurables (arrivées / pauses / départs) qui
-- forment les lignes de la grille de planning.
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

-- Qui est affecté à quel créneau, quel jour.
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

-- Jours exceptionnellement fermés (en plus des week-ends), ex: un jour
-- encore compté comme vacances par le calendrier officiel mais où le
-- centre a en réalité déjà rouvert l'école.
create table public.jours_fermeture (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  motif text,
  created_at timestamptz not null default now()
);

alter table public.jours_fermeture enable row level security;

create policy "jours_fermeture: readable by any signed-in user" on public.jours_fermeture
  for select using (auth.role() = 'authenticated');

create policy "jours_fermeture: directeur/coordinateur write" on public.jours_fermeture
  for all using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));

-- Effectif d'enfants par jour et par groupe, pour calculer combien
-- d'animateurs doivent rester présents à l'ouverture/fermeture.
create table public.effectifs_jour (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  groupe text not null check (groupe in ('lutins', 'trolls', 'geants')),
  effectif integer not null check (effectif >= 0),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (date, groupe)
);

alter table public.effectifs_jour enable row level security;

create policy "effectifs_jour: readable by any signed-in user" on public.effectifs_jour
  for select using (auth.role() = 'authenticated');

create policy "effectifs_jour: directeur/coordinateur write" on public.effectifs_jour
  for all using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));

-- Paliers d'encadrement : "à partir de X enfants, il faut Y animateurs
-- à l'ouverture/fermeture" — configurables, plus proche de la réalité
-- (arrivées échelonnées) qu'un simple ratio.
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

-- Communication interne (simple message board visible to all 3 espaces).
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  auteur_id uuid references public.profiles (id),
  contenu text not null,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "messages: readable by any signed-in user" on public.messages
  for select using (auth.role() = 'authenticated');

create policy "messages: any signed-in user can post as themselves" on public.messages
  for insert with check (auth.uid() = auteur_id);

create policy "messages: author or directeur can delete" on public.messages
  for delete using (auth.uid() = auteur_id or public.current_role_name() = 'directeur');

-- Répartition quotidienne des animateurs sur les 3 groupes (Lutins /
-- Trolls / Géants), un animateur ne peut être que dans un seul groupe
-- par jour.
create table public.affectations_jour (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  animateur_id uuid not null references public.animateurs (id) on delete cascade,
  groupe text not null check (groupe in ('lutins', 'trolls', 'geants')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (date, animateur_id)
);

alter table public.affectations_jour enable row level security;

create policy "affectations_jour: readable by any signed-in user" on public.affectations_jour
  for select using (auth.role() = 'authenticated');

create policy "affectations_jour: directeur/coordinateur write" on public.affectations_jour
  for all using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));
