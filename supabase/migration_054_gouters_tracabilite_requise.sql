-- Certains produits (ex. fruits entiers, eau) n'ont pas besoin de la
-- traçabilité photo/lot/DLC : case à cocher par produit, cochée par défaut
-- (tout reste tracé sauf exemption explicite).
alter table public.produits_gouter
  add column tracabilite_requise boolean not null default true;
