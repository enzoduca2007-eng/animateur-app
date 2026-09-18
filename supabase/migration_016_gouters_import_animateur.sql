-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_015_gouters.sql. Permet à un animateur affecté à un groupe
-- un jour donné d'importer directement la/les photo(s) d'emballage (une
-- ligne créée automatiquement par photo, sans que le directeur/
-- coordinateur ait besoin de créer la fiche à l'avance) : l'IA se charge
-- de reconnaître le type de produit, la marque, le nom du produit, le
-- numéro de lot, la DLC/DLUO et la quantité.

alter table public.gouters alter column type_produit drop not null;
alter table public.gouters alter column marque drop not null;

create or replace function public.gouters_verrouille_champs_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.peut_gerer_groupe(old.groupe) then
    new.groupe := old.groupe;
    new.date := old.date;
    if not public.est_affecte_ce_jour(old.groupe, old.date) then
      new.type_produit := old.type_produit;
      new.marque := old.marque;
    end if;
  end if;
  return new;
end;
$$;

drop policy if exists "gouters: directeur/coordinateur insert" on public.gouters;
drop policy if exists "gouters: directeur/coordinateur update" on public.gouters;

create policy "gouters: insert" on public.gouters
  for insert
  with check (public.peut_gerer_groupe(groupe) or public.est_affecte_ce_jour(groupe, date));

create policy "gouters: update" on public.gouters
  for update
  using (public.peut_gerer_groupe(groupe) or public.est_affecte_ce_jour(groupe, date))
  with check (public.peut_gerer_groupe(groupe) or public.est_affecte_ce_jour(groupe, date));
