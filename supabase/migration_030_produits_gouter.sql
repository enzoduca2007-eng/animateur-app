-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_029_fiches_animation.sql. Ajoute un catalogue de produits
-- de goûter (ex. "Bichocos" : 2 par personne, paquet de 20) pour
-- calculer automatiquement le nombre de paquets à prendre chaque jour
-- de la période, en fonction de l'effectif enfants + animateurs.

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
