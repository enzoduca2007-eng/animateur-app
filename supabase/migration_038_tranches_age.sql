-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_037_gestionnaire_par_etablissement.sql.
--
-- Ajoute la tranche d'âge (années de naissance min/max) de chaque groupe
-- pour un établissement — un des "paramètres" que le gestionnaire (global
-- ou scopé à cet établissement) peut configurer, en plus des comptes et
-- des créneaux/paliers/fermetures déjà en place. Les groupes eux-mêmes
-- restent figés (lutins/trolls) — seule leur tranche d'âge devient
-- configurable ici.
--
-- Idempotente : peut être relancée sans erreur.

create table if not exists public.tranches_age (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements (id),
  groupe text not null check (groupe in ('lutins', 'trolls')),
  annee_naissance_min integer,
  annee_naissance_max integer,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (etablissement_id, groupe)
);

alter table public.tranches_age enable row level security;

drop trigger if exists tranches_age_etablissement_defaut on public.tranches_age;
create trigger tranches_age_etablissement_defaut
  before insert on public.tranches_age
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "tranches_age: readable by any signed-in user" on public.tranches_age;
create policy "tranches_age: readable by any signed-in user" on public.tranches_age
  for select using (public.dans_mon_etablissement(etablissement_id));

-- Comme les créneaux/paliers/fermetures : directeur, coordinateur ou
-- gestionnaire (global ou de cet établissement).
drop policy if exists "tranches_age: direction write" on public.tranches_age;
create policy "tranches_age: direction write" on public.tranches_age
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'coordinateur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id));
