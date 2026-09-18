-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_005_stagiaire_age.sql. Ajoute l'effectif d'enfants par jour
-- et par groupe, et un taux d'encadrement réglable, pour calculer
-- combien d'animateurs doivent rester présents à l'ouverture/fermeture.

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

-- Réglages globaux (une seule ligne). ratio_encadrement = nombre
-- d'enfants par animateur ; à ajuster selon vos propres règles.
create table public.reglages (
  id integer primary key default 1,
  ratio_encadrement integer not null default 12,
  constraint reglages_singleton check (id = 1)
);

alter table public.reglages enable row level security;

create policy "reglages: readable by any signed-in user" on public.reglages
  for select using (auth.role() = 'authenticated');

create policy "reglages: directeur/coordinateur write" on public.reglages
  for all using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));

insert into public.reglages (id, ratio_encadrement) values (1, 12)
  on conflict (id) do nothing;
