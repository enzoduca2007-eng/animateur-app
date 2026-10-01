-- La quantité/enfant d'un produit de goûter diffère selon le groupe (un
-- Lutin de 4 ans ne mange pas la même portion qu'un Géant de 11 ans) :
-- remplace la colonne unique quantite_par_enfant par une quantité par
-- bloc (Lutins/Trolls/Géants), backfillée avec l'ancienne valeur commune.
alter table public.produits_gouter
  add column quantite_lutins integer default 1,
  add column quantite_trolls integer default 1,
  add column quantite_geants integer default 1;

update public.produits_gouter
set quantite_lutins = quantite_par_enfant,
    quantite_trolls = quantite_par_enfant,
    quantite_geants = quantite_par_enfant;

alter table public.produits_gouter
  alter column quantite_lutins set not null,
  alter column quantite_trolls set not null,
  alter column quantite_geants set not null,
  add constraint produits_gouter_quantite_lutins_check check (quantite_lutins > 0),
  add constraint produits_gouter_quantite_trolls_check check (quantite_trolls > 0),
  add constraint produits_gouter_quantite_geants_check check (quantite_geants > 0),
  drop column quantite_par_enfant;
