-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_029_fiches_animation.sql. Ajoute un catalogue de produits
-- de goûter (ex. "Bichocos" : 2 par personne, paquet de 20) pour
-- calculer automatiquement le nombre de paquets à prendre chaque jour
-- de la période, en fonction de l'effectif enfants + animateurs.
--
-- Idempotente : peut être relancée sans erreur même si une exécution
-- précédente (avec l'ancien schéma, sans gouters_prevus) a déjà tourné.

drop table if exists public.gouters_prevus cascade;
drop table if exists public.produits_gouter cascade;

create table public.produits_gouter (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  quantite_par_personne integer not null check (quantite_par_personne > 0),
  taille_paquet integer not null check (taille_paquet > 0),
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

-- Le goûter prévu peut différer d'un groupe à l'autre le même jour (ex.
-- Lutins ont des compotes, Trolls des bichocos) : un produit choisi par
-- (date, groupe), d'où la quantité à acheter est déduite pour CE
-- groupe (son propre effectif + ses propres animateurs ce jour-là).
create table public.gouters_prevus (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  groupe text not null check (groupe in ('lutins', 'trolls')),
  produit_id uuid not null references public.produits_gouter (id) on delete cascade,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (date, groupe)
);

alter table public.gouters_prevus enable row level security;

create policy "gouters_prevus: readable by any signed-in user" on public.gouters_prevus
  for select using (auth.role() = 'authenticated');

create policy "gouters_prevus: write by group management" on public.gouters_prevus
  for all
  using (public.peut_gerer_groupe(groupe))
  with check (public.peut_gerer_groupe(groupe));
