-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_030_produits_gouter.sql. Permet au directeur de verrouiller
-- une semaine de planning une fois finalisée : plus aucune modification
-- (affectations, effectifs, répartition automatique, remise à zéro)
-- n'est possible tant que la semaine n'est pas déverrouillée.
--
-- Idempotente : peut être relancée sans erreur.

drop table if exists public.plannings_verrous cascade;

create table public.plannings_verrous (
  semaine_debut date primary key,
  verrouille_par uuid references public.profiles (id),
  verrouille_at timestamptz not null default now()
);

alter table public.plannings_verrous enable row level security;

create policy "plannings_verrous: readable by any signed-in user" on public.plannings_verrous
  for select using (auth.role() = 'authenticated');

create policy "plannings_verrous: directeur write" on public.plannings_verrous
  for all
  using (public.current_role_name() = 'directeur')
  with check (public.current_role_name() = 'directeur');
