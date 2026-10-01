-- Lien d'achat (ex. page du produit en magasin en ligne), optionnel, pour
-- retrouver rapidement où commander chaque produit du catalogue.
alter table public.produits_gouter
  add column lien text;
