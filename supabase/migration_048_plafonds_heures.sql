-- Plafonds hebdomadaires (mineur/majeur) configurables par etablissement,
-- au lieu d'une valeur fixe dans le code. Defauts : 40h mineur, 45h majeur.
alter table public.etablissements
  add column plafond_heures_mineur integer not null default 40 check (plafond_heures_mineur > 0),
  add column plafond_heures_majeur integer not null default 45 check (plafond_heures_majeur > 0);
