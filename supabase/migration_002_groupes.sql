-- Migration à exécuter dans le SQL Editor de Supabase si le schéma initial
-- (supabase/schema.sql) a déjà été exécuté. Ajoute la répartition
-- quotidienne des animateurs sur les 3 groupes (Lutins / Trolls / Géants)
-- et retire le champ libre "groupe" des animateurs (remplacé par la
-- répartition jour par jour).

alter table public.animateurs drop column if exists groupe;

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
