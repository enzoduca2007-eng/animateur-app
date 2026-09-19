-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_022_repartition_sous_groupe.sql. Ajoute le suivi de
-- présence jour par jour (tout le monde, indépendant du groupe) et un
-- champ Formation par animateur/période, pour la feuille de présence
-- imprimable sur la page Répartition.

create table public.presence_jour (
  id uuid primary key default gen_random_uuid(),
  animateur_id uuid not null references public.animateurs (id) on delete cascade,
  date date not null,
  present boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (animateur_id, date)
);

alter table public.presence_jour enable row level security;

create policy "presence_jour: readable by any signed-in user" on public.presence_jour
  for select using (auth.role() = 'authenticated');

create policy "presence_jour: directeur write" on public.presence_jour
  for all
  using (public.current_role_name() = 'directeur')
  with check (public.current_role_name() = 'directeur');

create table public.formations_periode (
  id uuid primary key default gen_random_uuid(),
  animateur_id uuid not null references public.animateurs (id) on delete cascade,
  periode_debut date not null,
  formation text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (animateur_id, periode_debut)
);

alter table public.formations_periode enable row level security;

create policy "formations_periode: readable by any signed-in user" on public.formations_periode
  for select using (auth.role() = 'authenticated');

create policy "formations_periode: directeur write" on public.formations_periode
  for all
  using (public.current_role_name() = 'directeur')
  with check (public.current_role_name() = 'directeur');
