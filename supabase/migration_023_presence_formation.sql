-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_022_repartition_sous_groupe.sql. Ajoute le suivi de
-- présence jour par jour (tout le monde, indépendant du groupe) et un
-- champ Formation par animateur (permanent, pas lié à une période),
-- pour la feuille de présence imprimable sur la page Répartition.

create table if not exists public.presence_jour (
  id uuid primary key default gen_random_uuid(),
  animateur_id uuid not null references public.animateurs (id) on delete cascade,
  date date not null,
  present boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (animateur_id, date)
);

alter table public.presence_jour enable row level security;

drop policy if exists "presence_jour: readable by any signed-in user" on public.presence_jour;
create policy "presence_jour: readable by any signed-in user" on public.presence_jour
  for select using (auth.role() = 'authenticated');

drop policy if exists "presence_jour: directeur write" on public.presence_jour;
create policy "presence_jour: directeur write" on public.presence_jour
  for all
  using (public.current_role_name() = 'directeur')
  with check (public.current_role_name() = 'directeur');

-- Formation : champ permanent sur la fiche animateur (pas par période).
alter table public.animateurs add column if not exists formation text;

-- Nettoyage si une version précédente de cette migration (formation par
-- période) avait déjà été exécutée.
drop table if exists public.formations_periode;
