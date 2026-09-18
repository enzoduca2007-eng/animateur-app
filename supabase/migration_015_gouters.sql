-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_014_repartition_directeur_only.sql. Ajoute la traçabilité
-- des goûters : le directeur/coordinateur saisit le type de produit et
-- la marque pour un groupe un jour donné ; un animateur affecté à ce
-- groupe ce jour-là prend une photo de l'emballage, qu'une IA analyse
-- pour en extraire le nom du produit, le numéro de lot, la DLC/DLUO et
-- la quantité.

create table public.gouters (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  groupe text not null check (groupe in ('lutins', 'trolls', 'geants')),
  type_produit text not null,
  marque text not null,
  photo_url text,
  nom_produit text,
  numero_lot text,
  date_peremption date,
  quantite text,
  statut_ia text not null default 'en_attente' check (statut_ia in ('en_attente', 'traite', 'echec')),
  erreur_ia text,
  created_by uuid references public.profiles (id),
  rempli_par uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index gouters_date_groupe_idx on public.gouters (date, groupe);

alter table public.gouters enable row level security;

-- Un animateur affecté à ce groupe ce jour-là (via la Répartition) peut
-- mettre à jour la ligne pour y ajouter sa photo — le trigger ci-dessous
-- l'empêche de toucher au type de produit / à la marque / au groupe / à la
-- date, réservés au directeur/coordinateur.
create or replace function public.est_affecte_ce_jour(p_groupe text, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.affectations_jour aj
    join public.animateurs a on a.id = aj.animateur_id
    where aj.groupe = p_groupe and aj.date = p_date and a.profile_id = auth.uid()
  );
$$;

create or replace function public.gouters_verrouille_champs_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.peut_gerer_groupe(old.groupe) then
    new.type_produit := old.type_produit;
    new.marque := old.marque;
    new.groupe := old.groupe;
    new.date := old.date;
  end if;
  return new;
end;
$$;

create trigger gouters_before_update
  before update on public.gouters
  for each row execute procedure public.gouters_verrouille_champs_admin();

create policy "gouters: readable by any signed-in user" on public.gouters
  for select using (auth.role() = 'authenticated');

-- Créer/modifier/supprimer la fiche (type de produit, marque) : réservé au
-- directeur, ou au coordinateur si le groupe est le sien.
create policy "gouters: directeur/coordinateur insert" on public.gouters
  for insert with check (public.peut_gerer_groupe(groupe));

create policy "gouters: directeur/coordinateur update" on public.gouters
  for update
  using (public.peut_gerer_groupe(groupe) or public.est_affecte_ce_jour(groupe, date))
  with check (public.peut_gerer_groupe(groupe) or public.est_affecte_ce_jour(groupe, date));

create policy "gouters: directeur/coordinateur delete" on public.gouters
  for delete using (public.peut_gerer_groupe(groupe));

-- Bucket de stockage pour les photos d'emballage des goûters.
insert into storage.buckets (id, name, public)
values ('gouters', 'gouters', true)
on conflict (id) do nothing;

create policy "gouters storage: readable by anyone" on storage.objects
  for select using (bucket_id = 'gouters');

create policy "gouters storage: authenticated insert" on storage.objects
  for insert with check (bucket_id = 'gouters' and auth.role() = 'authenticated');

create policy "gouters storage: authenticated update" on storage.objects
  for update using (bucket_id = 'gouters' and auth.role() = 'authenticated');

create policy "gouters storage: authenticated delete" on storage.objects
  for delete using (bucket_id = 'gouters' and auth.role() = 'authenticated');
