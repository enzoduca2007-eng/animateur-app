-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_003_planning_creneaux.sql. Permet de marquer des jours
-- exceptionnellement fermés (ex: le centre rouvre après les vacances
-- un jour qui était encore compté comme vacances par le calendrier
-- officiel) — ces jours sont exclus du planning au même titre que les
-- week-ends.

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

insert into public.jours_fermeture (date, motif) values
  ('2026-11-02', 'Rentrée scolaire — centre fermé');
