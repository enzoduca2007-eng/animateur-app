-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_016_gouters_import_animateur.sql. Fusionne Trolls et
-- Géants en un seul groupe réel partout (Répartition, Planning,
-- Effectifs, Fiches horaires, Goûters) : il n'y a plus que 2 groupes,
-- "lutins" et "trolls" (affiché "Trolls & Géants" côté interface).
--
-- Toutes les lignes existantes marquées "geants" basculent sur
-- "trolls", puis les contraintes sont resserrées pour ne plus
-- accepter "geants".

update public.profiles set groupe_coordinateur = 'trolls' where groupe_coordinateur = 'geants';

-- affectations_jour a unique(date, animateur_id) : un animateur n'est déjà
-- que dans un seul groupe par jour, donc pas de conflit possible.
update public.affectations_jour set groupe = 'trolls' where groupe = 'geants';

-- gouters n'a pas de contrainte unique sur (date, groupe) : pas de conflit.
update public.gouters set groupe = 'trolls' where groupe = 'geants';

-- effectifs_jour a unique(date, groupe) : si Trolls ET Géants avaient
-- chacun un effectif un même jour, on ne peut pas juste renommer "geants"
-- en "trolls" (doublon). On additionne les deux sur la ligne "trolls",
-- on supprime la ligne "geants" fusionnée, puis on renomme les "geants"
-- restants (jours où seul Géants avait une valeur).
update public.effectifs_jour t
set effectif = t.effectif + g.effectif
from public.effectifs_jour g
where g.groupe = 'geants'
  and t.groupe = 'trolls'
  and t.date = g.date;

delete from public.effectifs_jour g
using public.effectifs_jour t
where g.groupe = 'geants'
  and t.groupe = 'trolls'
  and t.date = g.date;

update public.effectifs_jour set groupe = 'trolls' where groupe = 'geants';

alter table public.profiles drop constraint if exists profiles_groupe_coordinateur_check;
alter table public.profiles add constraint profiles_groupe_coordinateur_check
  check (groupe_coordinateur in ('lutins', 'trolls'));

alter table public.affectations_jour drop constraint if exists affectations_jour_groupe_check;
alter table public.affectations_jour add constraint affectations_jour_groupe_check
  check (groupe in ('lutins', 'trolls'));

alter table public.effectifs_jour drop constraint if exists effectifs_jour_groupe_check;
alter table public.effectifs_jour add constraint effectifs_jour_groupe_check
  check (groupe in ('lutins', 'trolls'));

alter table public.gouters drop constraint if exists gouters_groupe_check;
alter table public.gouters add constraint gouters_groupe_check
  check (groupe in ('lutins', 'trolls'));
