-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_009_compte_animateur.sql. Ajoute les fiches horaires
-- (pointage) : horaires réels + présence, en plus des horaires
-- prévisionnels déjà présents dans le planning (affectations_creneau).

create table public.feuilles_temps (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  animateur_id uuid not null references public.animateurs (id) on delete cascade,
  present boolean not null default true,
  motif_absence text,
  heure_arrivee_reelle time,
  heure_depart_reelle time,
  commentaire text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (date, animateur_id)
);

alter table public.feuilles_temps enable row level security;

-- Un animateur ne peut modifier que ses propres fiches.
create or replace function public.est_mon_animateur(p_animateur_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.animateurs a
    where a.id = p_animateur_id and a.profile_id = auth.uid()
  );
$$;

create policy "feuilles_temps: readable by any signed-in user" on public.feuilles_temps
  for select using (auth.role() = 'authenticated');

create policy "feuilles_temps: directeur/coordinateur write" on public.feuilles_temps
  for all using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));

create policy "feuilles_temps: animateur writes their own" on public.feuilles_temps
  for all using (public.est_mon_animateur(animateur_id))
  with check (public.est_mon_animateur(animateur_id));
