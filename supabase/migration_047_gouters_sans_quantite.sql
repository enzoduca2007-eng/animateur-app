-- Retire les quantites du prevu de gouters (plus de calcul de paquets) :
-- produits_gouter redevient juste un nom.
alter table public.produits_gouter
  drop column quantite_par_personne,
  drop column taille_paquet;
