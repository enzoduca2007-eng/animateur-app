-- Les animateurs mangent aussi le goûter, mais leur portion n'est pas
-- forcément celle d'un groupe d'enfants : quantité/animateur dédiée sur
-- produits_gouter.
alter table public.produits_gouter
  add column quantite_animateur integer not null default 1 check (quantite_animateur > 0);
