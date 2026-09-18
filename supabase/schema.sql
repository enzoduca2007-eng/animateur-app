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

-- Plannings (schedule entries / shifts / activities).
create table public.plannings (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  date date not null,
  heure_debut time,
  heure_fin time,
  lieu text,
  description text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.plannings enable row level security;

create policy "plannings: readable by any signed-in user" on public.plannings
  for select using (auth.role() = 'authenticated');

create policy "plannings: directeur/coordinateur write" on public.plannings
  for all using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));

-- Which animateurs are assigned to which planning entry.
create table public.planning_animateurs (
  planning_id uuid references public.plannings (id) on delete cascade,
  animateur_id uuid references public.animateurs (id) on delete cascade,
  primary key (planning_id, animateur_id)
);

alter table public.planning_animateurs enable row level security;

create policy "planning_animateurs: readable by any signed-in user" on public.planning_animateurs
  for select using (auth.role() = 'authenticated');

create policy "planning_animateurs: directeur/coordinateur write" on public.planning_animateurs
  for all using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));

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
