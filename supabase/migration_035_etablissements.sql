-- Migration à exécuter dans le SQL Editor de Supabase APRÈS avoir exécuté
-- migration_034_etablissements.sql seule (voir son commentaire d'en-tête —
-- elle doit être validée dans sa propre transaction avant celle-ci).
--
-- Phase 1 du multi-établissements :
-- - une table etablissements ;
-- - un nouveau rôle "gestionnaire", transverse à tous les établissements ;
-- - une colonne etablissement_id sur toutes les tables de données
--   existantes, avec RLS mise à jour pour qu'un compte d'un établissement
--   ne voie jamais les données d'un autre ;
-- - un trigger générique qui remplit automatiquement etablissement_id à
--   l'insertion à partir du profil connecté, pour que le code applicatif
--   existant (Plannings, Répartition, Activités, Gouters, Stagiaires...)
--   n'ait RIEN à changer pour un compte directeur/coordinateur/
--   responsable/animateur normal.
--
-- Les groupes (lutins/trolls) et les tranches d'âge restent figés comme
-- aujourd'hui (phase 2 à venir) : un gestionnaire ne peut pas encore les
-- reconfigurer. Idem pour le bucket de stockage "gouters" (photos), qui
-- reste partagé entre établissements pour l'instant.
--
-- Idempotente : peut être relancée sans erreur.

-- ============================================================
-- 1. Établissements
-- ============================================================

create table if not exists public.etablissements (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.etablissements enable row level security;

-- Lecture publique (y compris anonyme) : le formulaire d'inscription doit
-- pouvoir lister les établissements AVANT que le visiteur ait un compte.
-- Seuls id/nom sont exposés par les pages qui l'utilisent, rien de sensible.
drop policy if exists "etablissements: readable by any signed-in user" on public.etablissements;
drop policy if exists "etablissements: public read" on public.etablissements;
create policy "etablissements: public read" on public.etablissements
  for select using (true);

drop policy if exists "etablissements: gestionnaire write" on public.etablissements;
create policy "etablissements: gestionnaire write" on public.etablissements
  for all
  using (public.current_role_name() = 'gestionnaire')
  with check (public.current_role_name() = 'gestionnaire');

-- Établissement "historique" auquel toutes les données existantes sont
-- rattachées lors du backfill ci-dessous — id fixe pour pouvoir le
-- référencer dans les UPDATE sans variable PL/pgSQL.
insert into public.etablissements (id, nom)
values ('00000000-0000-0000-0000-000000000001', 'MJC Étoile')
on conflict (id) do nothing;

-- La colonne est ajoutée ici (avant les fonctions ci-dessous qui la lisent)
-- ; son backfill/contrainte/policies suivent plus bas, section 3.
alter table public.profiles
  add column if not exists etablissement_id uuid references public.etablissements (id);

-- ============================================================
-- 2. Fonctions communes
-- ============================================================

-- Établissement du compte connecté (null pour un gestionnaire, qui n'est
-- rattaché à aucun établissement en particulier).
create or replace function public.current_etablissement_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select etablissement_id from public.profiles where id = auth.uid();
$$;

-- Vrai si la ligne (via son etablissement_id) appartient à l'établissement
-- du compte connecté, ou si le compte connecté est gestionnaire (accès à
-- tous les établissements). À combiner (AND) avec les règles métier
-- existantes de chaque policy.
create or replace function public.dans_mon_etablissement(p_etablissement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_etablissement_id = public.current_etablissement_id()
    or public.current_role_name() = 'gestionnaire';
$$;

-- Remplit automatiquement etablissement_id à l'insertion quand l'app ne le
-- précise pas, à partir du profil du compte connecté — pour qu'aucun appel
-- .insert() existant n'ait besoin d'être modifié.
create or replace function public.etablissement_id_par_defaut()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.etablissement_id is null then
    new.etablissement_id := public.current_etablissement_id();
  end if;
  return new;
end;
$$;

-- ============================================================
-- 3. profiles
-- ============================================================
-- (colonne etablissement_id déjà ajoutée avant la section 2 ci-dessus)

update public.profiles
  set etablissement_id = '00000000-0000-0000-0000-000000000001'
  where etablissement_id is null and role <> 'gestionnaire';

alter table public.profiles
  drop constraint if exists profiles_etablissement_requis;
alter table public.profiles
  add constraint profiles_etablissement_requis
  check (role = 'gestionnaire' or etablissement_id is not null);

-- handle_new_user() : rattache le nouveau compte à l'établissement transmis
-- à l'inscription (jamais "gestionnaire" par ce chemin — créé uniquement à
-- la main en SQL).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, etablissement_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'role', 'gestionnaire')::public.user_role,
      'responsable'
    ),
    (new.raw_user_meta_data ->> 'etablissement_id')::uuid
  );
  return new;
end;
$$;

drop policy if exists "profiles: readable by any signed-in user" on public.profiles;
create policy "profiles: readable by any signed-in user" on public.profiles
  for select using (
    auth.uid() = id or public.dans_mon_etablissement(etablissement_id)
  );

drop policy if exists "profiles: directeur manages all rows" on public.profiles;
create policy "profiles: directeur manages all rows" on public.profiles
  for all
  using (public.current_role_name() = 'directeur' and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() = 'directeur' and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 4. animateurs
-- ============================================================

alter table public.animateurs
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.animateurs set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.animateurs alter column etablissement_id set not null;

drop trigger if exists animateurs_etablissement_defaut on public.animateurs;
create trigger animateurs_etablissement_defaut
  before insert on public.animateurs
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "animateurs: readable by any signed-in user" on public.animateurs;
create policy "animateurs: readable by any signed-in user" on public.animateurs
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "animateurs: directeur write" on public.animateurs;
create policy "animateurs: directeur write" on public.animateurs
  for all
  using (public.current_role_name() = 'directeur' and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() = 'directeur' and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 5. affectations_jour
-- ============================================================

alter table public.affectations_jour
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.affectations_jour set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.affectations_jour alter column etablissement_id set not null;

alter table public.affectations_jour drop constraint if exists affectations_jour_date_animateur_id_key;
alter table public.affectations_jour
  add constraint affectations_jour_etablissement_date_animateur_key
  unique (etablissement_id, date, animateur_id);

drop trigger if exists affectations_jour_etablissement_defaut on public.affectations_jour;
create trigger affectations_jour_etablissement_defaut
  before insert on public.affectations_jour
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "affectations_jour: readable by any signed-in user" on public.affectations_jour;
create policy "affectations_jour: readable by any signed-in user" on public.affectations_jour
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "affectations_jour: directeur write" on public.affectations_jour;
create policy "affectations_jour: directeur write" on public.affectations_jour
  for all
  using (public.current_role_name() = 'directeur' and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() = 'directeur' and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 6. creneaux
-- ============================================================

alter table public.creneaux
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.creneaux set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.creneaux alter column etablissement_id set not null;

drop trigger if exists creneaux_etablissement_defaut on public.creneaux;
create trigger creneaux_etablissement_defaut
  before insert on public.creneaux
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "creneaux: readable by any signed-in user" on public.creneaux;
create policy "creneaux: readable by any signed-in user" on public.creneaux
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "creneaux: directeur/coordinateur write" on public.creneaux;
create policy "creneaux: directeur/coordinateur write" on public.creneaux
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'coordinateur') and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 7. affectations_creneau
-- ============================================================

alter table public.affectations_creneau
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.affectations_creneau set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.affectations_creneau alter column etablissement_id set not null;

alter table public.affectations_creneau drop constraint if exists affectations_creneau_date_creneau_id_animateur_id_key;
alter table public.affectations_creneau
  add constraint affectations_creneau_etablissement_date_creneau_animateur_key
  unique (etablissement_id, date, creneau_id, animateur_id);

drop trigger if exists affectations_creneau_etablissement_defaut on public.affectations_creneau;
create trigger affectations_creneau_etablissement_defaut
  before insert on public.affectations_creneau
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "affectations_creneau: readable by any signed-in user" on public.affectations_creneau;
create policy "affectations_creneau: readable by any signed-in user" on public.affectations_creneau
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "affectations_creneau: directeur/coordinateur write" on public.affectations_creneau;
create policy "affectations_creneau: directeur/coordinateur write" on public.affectations_creneau
  for all
  using (public.peut_gerer_groupe(public.groupe_de_ce_jour(animateur_id, date)) and public.dans_mon_etablissement(etablissement_id))
  with check (public.peut_gerer_groupe(public.groupe_de_ce_jour(animateur_id, date)) and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 8. jours_fermeture
-- ============================================================

alter table public.jours_fermeture
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.jours_fermeture set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.jours_fermeture alter column etablissement_id set not null;

alter table public.jours_fermeture drop constraint if exists jours_fermeture_date_key;
alter table public.jours_fermeture
  add constraint jours_fermeture_etablissement_date_key
  unique (etablissement_id, date);

drop trigger if exists jours_fermeture_etablissement_defaut on public.jours_fermeture;
create trigger jours_fermeture_etablissement_defaut
  before insert on public.jours_fermeture
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "jours_fermeture: readable by any signed-in user" on public.jours_fermeture;
create policy "jours_fermeture: readable by any signed-in user" on public.jours_fermeture
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "jours_fermeture: directeur/coordinateur write" on public.jours_fermeture;
create policy "jours_fermeture: directeur/coordinateur write" on public.jours_fermeture
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'coordinateur') and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 9. effectifs_jour
-- ============================================================

alter table public.effectifs_jour
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.effectifs_jour set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.effectifs_jour alter column etablissement_id set not null;

alter table public.effectifs_jour drop constraint if exists effectifs_jour_date_groupe_key;
alter table public.effectifs_jour
  add constraint effectifs_jour_etablissement_date_groupe_key
  unique (etablissement_id, date, groupe);

drop trigger if exists effectifs_jour_etablissement_defaut on public.effectifs_jour;
create trigger effectifs_jour_etablissement_defaut
  before insert on public.effectifs_jour
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "effectifs_jour: readable by any signed-in user" on public.effectifs_jour;
create policy "effectifs_jour: readable by any signed-in user" on public.effectifs_jour
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "effectifs_jour: directeur/coordinateur write" on public.effectifs_jour;
create policy "effectifs_jour: directeur/coordinateur write" on public.effectifs_jour
  for all
  using (public.peut_gerer_groupe(groupe) and public.dans_mon_etablissement(etablissement_id))
  with check (public.peut_gerer_groupe(groupe) and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 10. paliers_encadrement
-- ============================================================

alter table public.paliers_encadrement
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.paliers_encadrement set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.paliers_encadrement alter column etablissement_id set not null;

alter table public.paliers_encadrement drop constraint if exists paliers_encadrement_effectif_min_key;
alter table public.paliers_encadrement
  add constraint paliers_encadrement_etablissement_effectif_min_key
  unique (etablissement_id, effectif_min);

drop trigger if exists paliers_encadrement_etablissement_defaut on public.paliers_encadrement;
create trigger paliers_encadrement_etablissement_defaut
  before insert on public.paliers_encadrement
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "paliers_encadrement: readable by any signed-in user" on public.paliers_encadrement;
create policy "paliers_encadrement: readable by any signed-in user" on public.paliers_encadrement
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "paliers_encadrement: directeur/coordinateur write" on public.paliers_encadrement;
create policy "paliers_encadrement: directeur/coordinateur write" on public.paliers_encadrement
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'coordinateur') and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 11. feuilles_temps
-- ============================================================

alter table public.feuilles_temps
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.feuilles_temps set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.feuilles_temps alter column etablissement_id set not null;

alter table public.feuilles_temps drop constraint if exists feuilles_temps_date_animateur_id_key;
alter table public.feuilles_temps
  add constraint feuilles_temps_etablissement_date_animateur_key
  unique (etablissement_id, date, animateur_id);

drop trigger if exists feuilles_temps_etablissement_defaut on public.feuilles_temps;
create trigger feuilles_temps_etablissement_defaut
  before insert on public.feuilles_temps
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "feuilles_temps: readable by any signed-in user" on public.feuilles_temps;
create policy "feuilles_temps: readable by any signed-in user" on public.feuilles_temps
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "feuilles_temps: directeur/coordinateur write" on public.feuilles_temps;
create policy "feuilles_temps: directeur/coordinateur write" on public.feuilles_temps
  for all
  using (public.peut_gerer_groupe(public.groupe_de_ce_jour(animateur_id, date)) and public.dans_mon_etablissement(etablissement_id))
  with check (public.peut_gerer_groupe(public.groupe_de_ce_jour(animateur_id, date)) and public.dans_mon_etablissement(etablissement_id));

drop policy if exists "feuilles_temps: animateur writes their own" on public.feuilles_temps;
create policy "feuilles_temps: animateur writes their own" on public.feuilles_temps
  for all
  using (public.est_mon_animateur(animateur_id) and public.dans_mon_etablissement(etablissement_id))
  with check (public.est_mon_animateur(animateur_id) and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 12. messages
-- ============================================================

alter table public.messages
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.messages set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.messages alter column etablissement_id set not null;

drop trigger if exists messages_etablissement_defaut on public.messages;
create trigger messages_etablissement_defaut
  before insert on public.messages
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "messages: readable by any signed-in user" on public.messages;
create policy "messages: readable by any signed-in user" on public.messages
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "messages: any signed-in user can post as themselves" on public.messages;
create policy "messages: any signed-in user can post as themselves" on public.messages
  for insert with check (auth.uid() = auteur_id and public.dans_mon_etablissement(etablissement_id));

drop policy if exists "messages: author or directeur can delete" on public.messages;
create policy "messages: author or directeur can delete" on public.messages
  for delete using (
    auth.uid() = auteur_id
    or (public.current_role_name() = 'directeur' and public.dans_mon_etablissement(etablissement_id))
  );

-- ============================================================
-- 13. gouters (traçabilité)
-- ============================================================

alter table public.gouters
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.gouters set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.gouters alter column etablissement_id set not null;

drop trigger if exists gouters_etablissement_defaut on public.gouters;
create trigger gouters_etablissement_defaut
  before insert on public.gouters
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "gouters: readable by any signed-in user" on public.gouters;
create policy "gouters: readable by any signed-in user" on public.gouters
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "gouters: insert" on public.gouters;
create policy "gouters: insert" on public.gouters
  for insert
  with check (
    (public.peut_gerer_groupe(groupe) or public.est_affecte_ce_jour(groupe, date))
    and public.dans_mon_etablissement(etablissement_id)
  );

drop policy if exists "gouters: update" on public.gouters;
create policy "gouters: update" on public.gouters
  for update
  using (
    (public.peut_gerer_groupe(groupe) or public.est_affecte_ce_jour(groupe, date))
    and public.dans_mon_etablissement(etablissement_id)
  )
  with check (
    (public.peut_gerer_groupe(groupe) or public.est_affecte_ce_jour(groupe, date))
    and public.dans_mon_etablissement(etablissement_id)
  );

drop policy if exists "gouters: directeur/coordinateur delete" on public.gouters;
create policy "gouters: directeur/coordinateur delete" on public.gouters
  for delete using (public.peut_gerer_groupe(groupe) and public.dans_mon_etablissement(etablissement_id));

-- Bucket "gouters" (photos) : partagé entre établissements pour l'instant,
-- non cloisonné — à revoir plus tard si besoin.

-- ============================================================
-- 14. planning_activites
-- ============================================================

alter table public.planning_activites
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.planning_activites set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.planning_activites alter column etablissement_id set not null;

drop trigger if exists planning_activites_etablissement_defaut on public.planning_activites;
create trigger planning_activites_etablissement_defaut
  before insert on public.planning_activites
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "planning_activites: readable by any signed-in user" on public.planning_activites;
create policy "planning_activites: readable by any signed-in user" on public.planning_activites
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "planning_activites: insert" on public.planning_activites;
create policy "planning_activites: insert" on public.planning_activites
  for insert with check (public.peut_gerer_groupe(groupe) and public.dans_mon_etablissement(etablissement_id));

drop policy if exists "planning_activites: update" on public.planning_activites;
create policy "planning_activites: update" on public.planning_activites
  for update
  using ((public.peut_gerer_groupe(groupe) or public.est_dans_activite(animateur_ids)) and public.dans_mon_etablissement(etablissement_id))
  with check ((public.peut_gerer_groupe(groupe) or public.est_dans_activite(animateur_ids)) and public.dans_mon_etablissement(etablissement_id));

drop policy if exists "planning_activites: delete" on public.planning_activites;
create policy "planning_activites: delete" on public.planning_activites
  for delete using (public.peut_gerer_groupe(groupe) and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 15. themes_semaine
-- ============================================================

alter table public.themes_semaine
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.themes_semaine set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.themes_semaine alter column etablissement_id set not null;

alter table public.themes_semaine drop constraint if exists themes_semaine_groupe_semaine_debut_key;
alter table public.themes_semaine
  add constraint themes_semaine_etablissement_groupe_semaine_debut_key
  unique (etablissement_id, groupe, semaine_debut);

drop trigger if exists themes_semaine_etablissement_defaut on public.themes_semaine;
create trigger themes_semaine_etablissement_defaut
  before insert on public.themes_semaine
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "themes_semaine: readable by any signed-in user" on public.themes_semaine;
create policy "themes_semaine: readable by any signed-in user" on public.themes_semaine
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "themes_semaine: write" on public.themes_semaine;
create policy "themes_semaine: write" on public.themes_semaine
  for all
  using (public.peut_gerer_groupe(groupe) and public.dans_mon_etablissement(etablissement_id))
  with check (public.peut_gerer_groupe(groupe) and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 16. presence_jour
-- ============================================================

alter table public.presence_jour
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.presence_jour set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.presence_jour alter column etablissement_id set not null;

alter table public.presence_jour drop constraint if exists presence_jour_animateur_id_date_key;
alter table public.presence_jour
  add constraint presence_jour_etablissement_animateur_date_key
  unique (etablissement_id, animateur_id, date);

drop trigger if exists presence_jour_etablissement_defaut on public.presence_jour;
create trigger presence_jour_etablissement_defaut
  before insert on public.presence_jour
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "presence_jour: readable by any signed-in user" on public.presence_jour;
create policy "presence_jour: readable by any signed-in user" on public.presence_jour
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "presence_jour: directeur write" on public.presence_jour;
create policy "presence_jour: directeur write" on public.presence_jour
  for all
  using (public.current_role_name() = 'directeur' and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() = 'directeur' and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 17. effectifs_sous_groupe
-- ============================================================

alter table public.effectifs_sous_groupe
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.effectifs_sous_groupe set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.effectifs_sous_groupe alter column etablissement_id set not null;

alter table public.effectifs_sous_groupe drop constraint if exists effectifs_sous_groupe_date_sous_groupe_key;
alter table public.effectifs_sous_groupe
  add constraint effectifs_sous_groupe_etablissement_date_sous_groupe_key
  unique (etablissement_id, date, sous_groupe);

drop trigger if exists effectifs_sous_groupe_etablissement_defaut on public.effectifs_sous_groupe;
create trigger effectifs_sous_groupe_etablissement_defaut
  before insert on public.effectifs_sous_groupe
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "effectifs_sous_groupe: readable by any signed-in user" on public.effectifs_sous_groupe;
create policy "effectifs_sous_groupe: readable by any signed-in user" on public.effectifs_sous_groupe
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "effectifs_sous_groupe: directeur write" on public.effectifs_sous_groupe;
create policy "effectifs_sous_groupe: directeur write" on public.effectifs_sous_groupe
  for all
  using (public.current_role_name() = 'directeur' and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() = 'directeur' and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 18. direction_roster
-- ============================================================

alter table public.direction_roster
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.direction_roster set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.direction_roster alter column etablissement_id set not null;

drop trigger if exists direction_roster_etablissement_defaut on public.direction_roster;
create trigger direction_roster_etablissement_defaut
  before insert on public.direction_roster
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "direction_roster: readable by any signed-in user" on public.direction_roster;
create policy "direction_roster: readable by any signed-in user" on public.direction_roster
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "direction_roster: directeur write" on public.direction_roster;
create policy "direction_roster: directeur write" on public.direction_roster
  for all
  using (public.current_role_name() = 'directeur' and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() = 'directeur' and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 19. presence_direction_jour
-- ============================================================

alter table public.presence_direction_jour
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.presence_direction_jour set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.presence_direction_jour alter column etablissement_id set not null;

alter table public.presence_direction_jour drop constraint if exists presence_direction_jour_date_animateur_id_key;
alter table public.presence_direction_jour
  add constraint presence_direction_jour_etablissement_date_animateur_key
  unique (etablissement_id, date, animateur_id);

drop trigger if exists presence_direction_jour_etablissement_defaut on public.presence_direction_jour;
create trigger presence_direction_jour_etablissement_defaut
  before insert on public.presence_direction_jour
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "presence_direction_jour: readable by any signed-in user" on public.presence_direction_jour;
create policy "presence_direction_jour: readable by any signed-in user" on public.presence_direction_jour
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "presence_direction_jour: directeur write" on public.presence_direction_jour;
create policy "presence_direction_jour: directeur write" on public.presence_direction_jour
  for all
  using (public.current_role_name() = 'directeur' and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() = 'directeur' and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 20. evaluations_stagiaire
-- ============================================================

alter table public.evaluations_stagiaire
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.evaluations_stagiaire set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.evaluations_stagiaire alter column etablissement_id set not null;

drop trigger if exists evaluations_stagiaire_etablissement_defaut on public.evaluations_stagiaire;
create trigger evaluations_stagiaire_etablissement_defaut
  before insert on public.evaluations_stagiaire
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "evaluations_stagiaire: direction read" on public.evaluations_stagiaire;
create policy "evaluations_stagiaire: direction read" on public.evaluations_stagiaire
  for select
  using (public.current_role_name() in ('directeur', 'coordinateur') and public.dans_mon_etablissement(etablissement_id));

drop policy if exists "evaluations_stagiaire: direction write" on public.evaluations_stagiaire;
create policy "evaluations_stagiaire: direction write" on public.evaluations_stagiaire
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'coordinateur') and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 21. auto_evaluations_stagiaire
-- ============================================================

alter table public.auto_evaluations_stagiaire
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.auto_evaluations_stagiaire set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.auto_evaluations_stagiaire alter column etablissement_id set not null;

drop trigger if exists auto_evaluations_stagiaire_etablissement_defaut on public.auto_evaluations_stagiaire;
create trigger auto_evaluations_stagiaire_etablissement_defaut
  before insert on public.auto_evaluations_stagiaire
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "auto_evaluations_stagiaire: direction ou le stagiaire lisent" on public.auto_evaluations_stagiaire;
create policy "auto_evaluations_stagiaire: direction ou le stagiaire lisent" on public.auto_evaluations_stagiaire
  for select
  using (
    (public.current_role_name() in ('directeur', 'coordinateur') or public.est_mon_animateur(animateur_id))
    and public.dans_mon_etablissement(etablissement_id)
  );

drop policy if exists "auto_evaluations_stagiaire: le stagiaire ecrit la sienne" on public.auto_evaluations_stagiaire;
create policy "auto_evaluations_stagiaire: le stagiaire ecrit la sienne" on public.auto_evaluations_stagiaire
  for all
  using (public.est_mon_animateur(animateur_id) and public.dans_mon_etablissement(etablissement_id))
  with check (public.est_mon_animateur(animateur_id) and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 22. fiches_animation
-- ============================================================

alter table public.fiches_animation
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.fiches_animation set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.fiches_animation alter column etablissement_id set not null;

drop trigger if exists fiches_animation_etablissement_defaut on public.fiches_animation;
create trigger fiches_animation_etablissement_defaut
  before insert on public.fiches_animation
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "fiches_animation: readable by any signed-in user" on public.fiches_animation;
create policy "fiches_animation: readable by any signed-in user" on public.fiches_animation
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "fiches_animation: write by assigned or direction" on public.fiches_animation;
create policy "fiches_animation: write by assigned or direction" on public.fiches_animation
  for all
  using (public.peut_modifier_fiche_animation(planning_activite_id) and public.dans_mon_etablissement(etablissement_id))
  with check (public.peut_modifier_fiche_animation(planning_activite_id) and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 23. produits_gouter / declinaisons_gouter / gouters_prevus
-- ============================================================

alter table public.produits_gouter
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.produits_gouter set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.produits_gouter alter column etablissement_id set not null;

drop trigger if exists produits_gouter_etablissement_defaut on public.produits_gouter;
create trigger produits_gouter_etablissement_defaut
  before insert on public.produits_gouter
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "produits_gouter: readable by any signed-in user" on public.produits_gouter;
create policy "produits_gouter: readable by any signed-in user" on public.produits_gouter
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "produits_gouter: direction write" on public.produits_gouter;
create policy "produits_gouter: direction write" on public.produits_gouter
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'coordinateur') and public.dans_mon_etablissement(etablissement_id));

alter table public.declinaisons_gouter
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.declinaisons_gouter set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.declinaisons_gouter alter column etablissement_id set not null;

drop trigger if exists declinaisons_gouter_etablissement_defaut on public.declinaisons_gouter;
create trigger declinaisons_gouter_etablissement_defaut
  before insert on public.declinaisons_gouter
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "declinaisons_gouter: readable by any signed-in user" on public.declinaisons_gouter;
create policy "declinaisons_gouter: readable by any signed-in user" on public.declinaisons_gouter
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "declinaisons_gouter: direction write" on public.declinaisons_gouter;
create policy "declinaisons_gouter: direction write" on public.declinaisons_gouter
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'coordinateur') and public.dans_mon_etablissement(etablissement_id));

alter table public.gouters_prevus
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.gouters_prevus set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.gouters_prevus alter column etablissement_id set not null;

alter table public.gouters_prevus drop constraint if exists gouters_prevus_date_groupe_declinaison_id_key;
alter table public.gouters_prevus
  add constraint gouters_prevus_etablissement_date_groupe_declinaison_key
  unique (etablissement_id, date, groupe, declinaison_id);

drop trigger if exists gouters_prevus_etablissement_defaut on public.gouters_prevus;
create trigger gouters_prevus_etablissement_defaut
  before insert on public.gouters_prevus
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "gouters_prevus: readable by any signed-in user" on public.gouters_prevus;
create policy "gouters_prevus: readable by any signed-in user" on public.gouters_prevus
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "gouters_prevus: write by group management" on public.gouters_prevus;
create policy "gouters_prevus: write by group management" on public.gouters_prevus
  for all
  using (public.peut_gerer_groupe(groupe) and public.dans_mon_etablissement(etablissement_id))
  with check (public.peut_gerer_groupe(groupe) and public.dans_mon_etablissement(etablissement_id));

-- ============================================================
-- 24. plannings_verrous / plannings_publications
-- ============================================================

alter table public.plannings_verrous drop constraint if exists plannings_verrous_pkey;
alter table public.plannings_verrous
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.plannings_verrous set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.plannings_verrous alter column etablissement_id set not null;
alter table public.plannings_verrous
  add constraint plannings_verrous_pkey primary key (etablissement_id, semaine_debut);

drop trigger if exists plannings_verrous_etablissement_defaut on public.plannings_verrous;
create trigger plannings_verrous_etablissement_defaut
  before insert on public.plannings_verrous
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "plannings_verrous: readable by any signed-in user" on public.plannings_verrous;
create policy "plannings_verrous: readable by any signed-in user" on public.plannings_verrous
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "plannings_verrous: directeur write" on public.plannings_verrous;
create policy "plannings_verrous: directeur write" on public.plannings_verrous
  for all
  using (public.current_role_name() = 'directeur' and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() = 'directeur' and public.dans_mon_etablissement(etablissement_id));

alter table public.plannings_publications drop constraint if exists plannings_publications_pkey;
alter table public.plannings_publications
  add column if not exists etablissement_id uuid references public.etablissements (id);
update public.plannings_publications set etablissement_id = '00000000-0000-0000-0000-000000000001' where etablissement_id is null;
alter table public.plannings_publications alter column etablissement_id set not null;
alter table public.plannings_publications
  add constraint plannings_publications_pkey primary key (etablissement_id, semaine_debut);

drop trigger if exists plannings_publications_etablissement_defaut on public.plannings_publications;
create trigger plannings_publications_etablissement_defaut
  before insert on public.plannings_publications
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "plannings_publications: readable by any signed-in user" on public.plannings_publications;
create policy "plannings_publications: readable by any signed-in user" on public.plannings_publications
  for select using (public.dans_mon_etablissement(etablissement_id));

drop policy if exists "plannings_publications: direction write" on public.plannings_publications;
create policy "plannings_publications: direction write" on public.plannings_publications
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'coordinateur') and public.dans_mon_etablissement(etablissement_id));
