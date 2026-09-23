-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_038_tranches_age.sql.
--
-- Corrige "Database error deleting user" : chaque colonne created_by/
-- rempli_par/verrouille_par/publie_par/auteur_id référence profiles(id)
-- SANS "on delete set null", donc Postgres refuse de supprimer un compte
-- (auth.users → cascade sur profiles → bloqué par ces FK) dès qu'il a créé
-- ne serait-ce qu'une ligne quelque part. On passe toutes ces FK en
-- "on delete set null" : supprimer un compte garde l'historique (qui a
-- créé quoi), juste avec un "créé par" vidé plutôt que de tout bloquer.
--
-- Idempotente : peut être relancée sans erreur.

alter table public.etablissements drop constraint if exists etablissements_created_by_fkey;
alter table public.etablissements
  add constraint etablissements_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.animateurs drop constraint if exists animateurs_created_by_fkey;
alter table public.animateurs
  add constraint animateurs_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.affectations_jour drop constraint if exists affectations_jour_created_by_fkey;
alter table public.affectations_jour
  add constraint affectations_jour_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.affectations_creneau drop constraint if exists affectations_creneau_created_by_fkey;
alter table public.affectations_creneau
  add constraint affectations_creneau_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.effectifs_jour drop constraint if exists effectifs_jour_created_by_fkey;
alter table public.effectifs_jour
  add constraint effectifs_jour_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.tranches_age drop constraint if exists tranches_age_created_by_fkey;
alter table public.tranches_age
  add constraint tranches_age_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.feuilles_temps drop constraint if exists feuilles_temps_created_by_fkey;
alter table public.feuilles_temps
  add constraint feuilles_temps_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.messages drop constraint if exists messages_auteur_id_fkey;
alter table public.messages
  add constraint messages_auteur_id_fkey foreign key (auteur_id)
  references public.profiles (id) on delete set null;

alter table public.gouters drop constraint if exists gouters_created_by_fkey;
alter table public.gouters
  add constraint gouters_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.gouters drop constraint if exists gouters_rempli_par_fkey;
alter table public.gouters
  add constraint gouters_rempli_par_fkey foreign key (rempli_par)
  references public.profiles (id) on delete set null;

alter table public.planning_activites drop constraint if exists planning_activites_created_by_fkey;
alter table public.planning_activites
  add constraint planning_activites_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.themes_semaine drop constraint if exists themes_semaine_created_by_fkey;
alter table public.themes_semaine
  add constraint themes_semaine_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.presence_jour drop constraint if exists presence_jour_created_by_fkey;
alter table public.presence_jour
  add constraint presence_jour_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.effectifs_sous_groupe drop constraint if exists effectifs_sous_groupe_created_by_fkey;
alter table public.effectifs_sous_groupe
  add constraint effectifs_sous_groupe_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.direction_roster drop constraint if exists direction_roster_created_by_fkey;
alter table public.direction_roster
  add constraint direction_roster_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.presence_direction_jour drop constraint if exists presence_direction_jour_created_by_fkey;
alter table public.presence_direction_jour
  add constraint presence_direction_jour_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.evaluations_stagiaire drop constraint if exists evaluations_stagiaire_verrouille_par_fkey;
alter table public.evaluations_stagiaire
  add constraint evaluations_stagiaire_verrouille_par_fkey foreign key (verrouille_par)
  references public.profiles (id) on delete set null;

alter table public.evaluations_stagiaire drop constraint if exists evaluations_stagiaire_created_by_fkey;
alter table public.evaluations_stagiaire
  add constraint evaluations_stagiaire_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.fiches_animation drop constraint if exists fiches_animation_created_by_fkey;
alter table public.fiches_animation
  add constraint fiches_animation_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.produits_gouter drop constraint if exists produits_gouter_created_by_fkey;
alter table public.produits_gouter
  add constraint produits_gouter_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.declinaisons_gouter drop constraint if exists declinaisons_gouter_created_by_fkey;
alter table public.declinaisons_gouter
  add constraint declinaisons_gouter_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.gouters_prevus drop constraint if exists gouters_prevus_created_by_fkey;
alter table public.gouters_prevus
  add constraint gouters_prevus_created_by_fkey foreign key (created_by)
  references public.profiles (id) on delete set null;

alter table public.plannings_verrous drop constraint if exists plannings_verrous_verrouille_par_fkey;
alter table public.plannings_verrous
  add constraint plannings_verrous_verrouille_par_fkey foreign key (verrouille_par)
  references public.profiles (id) on delete set null;

alter table public.plannings_publications drop constraint if exists plannings_publications_publie_par_fkey;
alter table public.plannings_publications
  add constraint plannings_publications_publie_par_fkey foreign key (publie_par)
  references public.profiles (id) on delete set null;
