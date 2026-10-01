-- Ajoute marque, quantité/enfant, taille de paquet et prix du paquet sur
-- produits_gouter, pour calculer automatiquement (dans le prévisionnel) le
-- nombre de paquets à acheter et le coût, à partir des effectifs du jour.
alter table public.produits_gouter
  add column marque text,
  add column quantite_par_enfant integer not null default 1 check (quantite_par_enfant > 0),
  add column taille_paquet integer not null default 20 check (taille_paquet > 0),
  add column prix_paquet numeric(6,2) not null default 0 check (prix_paquet >= 0);
