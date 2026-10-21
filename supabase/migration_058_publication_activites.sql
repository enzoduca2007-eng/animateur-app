-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_057_affectations_creneau_groupe.sql. Sépare la publication du
-- planning d'activités de celle des horaires (table plannings_publications,
-- migration_033) : la direction peut désormais publier l'un sans l'autre.
-- Tant qu'une semaine n'est pas publiée ici, les animateurs (et
-- responsables) ne voient pas les activités de cette semaine sur Mon
-- planning — la direction, elle, voit et prépare toujours le planning quel
-- que soit son état de publication.
--
-- Idempotente : peut être relancée sans erreur.

drop table if exists public.activites_publications cascade;

create table public.activites_publications (
  semaine_debut date primary key,
  publie_par uuid references public.profiles (id),
  publie_at timestamptz not null default now()
);

alter table public.activites_publications enable row level security;

create policy "activites_publications: readable by any signed-in user" on public.activites_publications
  for select using (auth.role() = 'authenticated');

create policy "activites_publications: direction write" on public.activites_publications
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));
