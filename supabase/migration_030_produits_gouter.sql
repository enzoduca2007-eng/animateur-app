-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_029_fiches_animation.sql. Ajoute le prévisionnel d'achats
-- de goûters :
-- - un catalogue de produits de base (ex. "Bichocos") ;
-- - pour chaque produit, une ou plusieurs déclinaisons par marque (ex.
--   "LU" : 2/personne, paquet de 20 — "Carrefour" : 3/personne,
--   paquet de 24), chaque marque ayant sa propre quantité ;
-- - pour chaque (jour, groupe), plusieurs déclinaisons peuvent être
--   prévues à la fois (le goûter peut combiner plusieurs produits, et
--   diffère d'un groupe à l'autre le même jour).
--
-- Idempotente : peut être relancée sans erreur même si une exécution
-- précédente (avec un schéma différent) a déjà tourné.

drop table if exists public.gouters_prevus cascade;
drop table if exists public.declinaisons_gouter cascade;
drop table if exists public.produits_gouter cascade;

create table public.produits_gouter (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  actif boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.produits_gouter enable row level security;

create policy "produits_gouter: readable by any signed-in user" on public.produits_gouter
  for select using (auth.role() = 'authenticated');

create policy "produits_gouter: direction write" on public.produits_gouter
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));

create table public.declinaisons_gouter (
  id uuid primary key default gen_random_uuid(),
  produit_id uuid not null references public.produits_gouter (id) on delete cascade,
  marque text not null,
  quantite_par_personne integer not null check (quantite_par_personne > 0),
  taille_paquet integer not null check (taille_paquet > 0),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.declinaisons_gouter enable row level security;

create policy "declinaisons_gouter: readable by any signed-in user" on public.declinaisons_gouter
  for select using (auth.role() = 'authenticated');

create policy "declinaisons_gouter: direction write" on public.declinaisons_gouter
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));

-- Le goûter prévu peut combiner plusieurs déclinaisons le même jour, et
-- différer d'un groupe à l'autre : une ligne par (date, groupe,
-- déclinaison), d'où la quantité à acheter est déduite pour ce groupe
-- (son propre effectif + ses propres animateurs ce jour-là).
create table public.gouters_prevus (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  groupe text not null check (groupe in ('lutins', 'trolls')),
  declinaison_id uuid not null references public.declinaisons_gouter (id) on delete cascade,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (date, groupe, declinaison_id)
);

alter table public.gouters_prevus enable row level security;

create policy "gouters_prevus: readable by any signed-in user" on public.gouters_prevus
  for select using (auth.role() = 'authenticated');

create policy "gouters_prevus: write by group management" on public.gouters_prevus
  for all
  using (public.peut_gerer_groupe(groupe))
  with check (public.peut_gerer_groupe(groupe));
