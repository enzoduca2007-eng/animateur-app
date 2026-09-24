-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_042_commun_avec_multiple.sql.
--
-- Covoiturage : des animateurs qui partagent une voiture doivent arriver
-- et repartir en même temps. Un groupe de covoiturage = une liste
-- ordonnée d'animateurs (le premier est le "chauffeur", dont les cases
-- arrivée/départ restent modifiables — les autres suivent automatiquement
-- et sont bloquées).
--
-- Idempotente : peut être relancée sans erreur.

create table if not exists public.covoiturages (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements (id),
  nom text,
  animateur_ids uuid[] not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.covoiturages enable row level security;

drop trigger if exists covoiturages_etablissement_defaut on public.covoiturages;
create trigger covoiturages_etablissement_defaut
  before insert on public.covoiturages
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "covoiturages: readable by any signed-in user" on public.covoiturages;
create policy "covoiturages: readable by any signed-in user" on public.covoiturages
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "covoiturages: directeur/coordinateur write" on public.covoiturages;
create policy "covoiturages: directeur/coordinateur write" on public.covoiturages
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'coordinateur') and public.dans_mon_etablissement(etablissement_id));
