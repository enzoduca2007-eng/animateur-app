-- Un roulant/inclusif n'a pas de groupe réel (presence_direction_jour),
-- donc une même ligne affectations_creneau (date, créneau, animateur) ne
-- permettait pas de savoir pour quel bloc (Lutins ou Trolls & Géants)
-- l'ouverture/fermeture avait été cochée : la même ligne apparaissait
-- cochée dans les deux plannings à la fois. Colonne optionnelle, posée
-- uniquement pour ces cas-là (null pour un animateur avec un groupe réel,
-- son bloc est déjà implicite via affectations_jour).
alter table public.affectations_creneau
  add column groupe text check (groupe in ('lutins', 'trolls'));
