-- Refonte des goûters : suppression des marques/déclinaisons (un produit =
-- une quantité/personne + une taille de paquet, directement sur
-- produits_gouter), séparation Lutins / Trolls / Géants via sous_groupe
-- (même mécanisme que planning_activites), et partage d'un goûter prévu
-- entre 2 ou 3 groupes via commun_avec.

-- 1. produits_gouter porte désormais directement la quantité/personne et
--    la taille de paquet (plus besoin de déclinaison par marque).
alter table public.produits_gouter
  add column quantite_par_personne integer not null default 1 check (quantite_par_personne > 0),
  add column taille_paquet integer not null default 20 check (taille_paquet > 0);

-- 2. gouters_prevus : declinaison_id -> produit_id (backfill depuis
--    declinaisons_gouter avant de la supprimer), + sous_groupe + commun_avec.
alter table public.gouters_prevus
  add column produit_id uuid references public.produits_gouter (id) on delete cascade;

update public.gouters_prevus gp
set produit_id = d.produit_id
from public.declinaisons_gouter d
where d.id = gp.declinaison_id;

delete from public.gouters_prevus where produit_id is null;

-- Retrouve dynamiquement le nom (auto-genere) de l'ancienne contrainte
-- unique portant sur declinaison_id, pour pouvoir la supprimer avant de
-- retirer la colonne (le nom exact depend de l'ordre des colonnes au
-- moment de la creation, pas garanti a l'avance).
do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'gouters_prevus'
    and con.contype = 'u'
    and 'declinaison_id' = any(
      array(
        select attname from pg_attribute
        where attrelid = con.conrelid and attnum = any(con.conkey)
      )
    );
  if cname is not null then
    execute format('alter table public.gouters_prevus drop constraint %I', cname);
  end if;
end $$;

alter table public.gouters_prevus
  alter column produit_id set not null,
  drop column declinaison_id,
  add column sous_groupe text check (sous_groupe in ('trolls', 'geants')),
  add column commun_avec text[] not null default '{}',
  add constraint gouters_prevus_commun_avec_valides check (
    commun_avec <@ array['lutins', 'trolls', 'geants']::text[]
  );

create unique index gouters_prevus_unique_idx on public.gouters_prevus (
  etablissement_id, date, groupe, coalesce(sous_groupe, ''), produit_id
);

drop table public.declinaisons_gouter;

-- 3. gouters (traçabilité du jour) : retire type_produit/marque (texte
--    libre), remplacés par un lien vers le catalogue produits_gouter ;
--    ajoute sous_groupe pour retrouver de quel bloc (Lutins/Trolls/Géants)
--    vient la fiche.
alter table public.gouters
  drop column type_produit,
  drop column marque,
  add column produit_id uuid references public.produits_gouter (id) on delete set null,
  add column sous_groupe text check (sous_groupe in ('trolls', 'geants'));

-- Le verrouillage protégeait type_produit/marque contre les tiers non
-- affectés ; on protège désormais produit_id/sous_groupe de la même façon.
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
      new.produit_id := old.produit_id;
      new.sous_groupe := old.sous_groupe;
    end if;
  end if;
  return new;
end;
$$;
