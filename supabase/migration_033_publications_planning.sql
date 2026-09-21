-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_032_verrou_evaluation_stagiaire.sql. Permet à la direction de
-- publier une semaine de planning : tant qu'elle n'est pas publiée, les
-- animateurs (et responsables) voient "Planning non publié" à la place du
-- planning sur Plannings et Mon planning — la direction, elle, voit et
-- prépare toujours le planning quel que soit son état de publication.
--
-- Idempotente : peut être relancée sans erreur.

drop table if exists public.plannings_publications cascade;

create table public.plannings_publications (
  semaine_debut date primary key,
  publie_par uuid references public.profiles (id),
  publie_at timestamptz not null default now()
);

alter table public.plannings_publications enable row level security;

create policy "plannings_publications: readable by any signed-in user" on public.plannings_publications
  for select using (auth.role() = 'authenticated');

create policy "plannings_publications: direction write" on public.plannings_publications
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));
