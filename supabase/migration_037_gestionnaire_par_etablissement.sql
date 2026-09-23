-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_036_gestionnaire_parametres.sql.
--
-- Jusqu'ici "gestionnaire" était un rôle unique, transverse à tous les
-- établissements (etablissement_id toujours null). Cette migration permet
-- D'AVOIR AUSSI un compte gestionnaire PAR établissement : un tel compte
-- (etablissement_id renseigné) agit comme un "super directeur" local — il
-- voit et gère uniquement SON établissement (comme un directeur), avec en
-- plus l'accès aux paramètres avancés (créneaux/paliers/fermetures, et
-- plus tard groupes/âges).
--
-- Seul le gestionnaire GLOBAL (etablissement_id null — ton compte) garde
-- le pouvoir de créer de nouveaux établissements ; un gestionnaire scopé à
-- un établissement ne peut pas en créer d'autres.
--
-- Idempotente : peut être relancée sans erreur.

-- dans_mon_etablissement() : l'accès transverse "voit tout" ne s'applique
-- plus qu'au gestionnaire SANS établissement (le global) — un gestionnaire
-- scopé à un établissement est traité comme n'importe quel compte de cet
-- établissement (ne voit que le sien).
create or replace function public.dans_mon_etablissement(p_etablissement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_etablissement_id = public.current_etablissement_id()
    or (public.current_role_name() = 'gestionnaire' and public.current_etablissement_id() is null);
$$;

-- peut_gerer_groupe() : un gestionnaire (scopé, donc déjà filtré par
-- dans_mon_etablissement dans chaque policy) a les mêmes droits qu'un
-- directeur sur les groupes de SON établissement.
create or replace function public.peut_gerer_groupe(p_groupe text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_role_name() in ('directeur', 'gestionnaire')
    or (
      public.current_role_name() = 'coordinateur'
      and (
        public.mon_groupe_coordinateur() is null
        or public.mon_groupe_coordinateur() = p_groupe
      )
    );
$$;

-- Un gestionnaire (comme un directeur) peut changer le rôle/groupe d'un
-- autre compte de son établissement.
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role_name() not in ('directeur', 'gestionnaire') then
    if new.role is distinct from old.role then
      new.role := old.role;
    end if;
    if new.groupe_coordinateur is distinct from old.groupe_coordinateur then
      new.groupe_coordinateur := old.groupe_coordinateur;
    end if;
  end if;
  return new;
end;
$$;

-- etablissements : seul le gestionnaire GLOBAL (sans établissement) peut
-- créer/modifier des établissements — un gestionnaire scopé ne peut pas en
-- créer d'autres.
drop policy if exists "etablissements: gestionnaire write" on public.etablissements;
create policy "etablissements: gestionnaire write" on public.etablissements
  for all
  using (public.current_role_name() = 'gestionnaire' and public.current_etablissement_id() is null)
  with check (public.current_role_name() = 'gestionnaire' and public.current_etablissement_id() is null);

-- profiles : un gestionnaire (comme un directeur) gère les comptes de son
-- établissement (dans_mon_etablissement le limite déjà à celui-ci, sauf
-- pour le gestionnaire global qui garde un accès transverse).
drop policy if exists "profiles: directeur manages all rows" on public.profiles;
create policy "profiles: directeur manages all rows" on public.profiles
  for all
  using (public.current_role_name() in ('directeur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id));

-- animateurs
drop policy if exists "animateurs: directeur write" on public.animateurs;
create policy "animateurs: directeur write" on public.animateurs
  for all
  using (public.current_role_name() in ('directeur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id));

-- affectations_jour (Répartition — réservée au directeur, et donc au
-- gestionnaire local qui a les mêmes pouvoirs)
drop policy if exists "affectations_jour: directeur write" on public.affectations_jour;
create policy "affectations_jour: directeur write" on public.affectations_jour
  for all
  using (public.current_role_name() in ('directeur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id));

-- presence_jour
drop policy if exists "presence_jour: directeur write" on public.presence_jour;
create policy "presence_jour: directeur write" on public.presence_jour
  for all
  using (public.current_role_name() in ('directeur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id));

-- effectifs_sous_groupe
drop policy if exists "effectifs_sous_groupe: directeur write" on public.effectifs_sous_groupe;
create policy "effectifs_sous_groupe: directeur write" on public.effectifs_sous_groupe
  for all
  using (public.current_role_name() in ('directeur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id));

-- direction_roster
drop policy if exists "direction_roster: directeur write" on public.direction_roster;
create policy "direction_roster: directeur write" on public.direction_roster
  for all
  using (public.current_role_name() in ('directeur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id));

-- presence_direction_jour
drop policy if exists "presence_direction_jour: directeur write" on public.presence_direction_jour;
create policy "presence_direction_jour: directeur write" on public.presence_direction_jour
  for all
  using (public.current_role_name() in ('directeur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id));

-- plannings_verrous (verrouillage de semaine, jusqu'ici directeur seul)
drop policy if exists "plannings_verrous: directeur write" on public.plannings_verrous;
create policy "plannings_verrous: directeur write" on public.plannings_verrous
  for all
  using (public.current_role_name() in ('directeur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id));

-- plannings_publications
drop policy if exists "plannings_publications: direction write" on public.plannings_publications;
create policy "plannings_publications: direction write" on public.plannings_publications
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'coordinateur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id));

-- produits_gouter / declinaisons_gouter
drop policy if exists "produits_gouter: direction write" on public.produits_gouter;
create policy "produits_gouter: direction write" on public.produits_gouter
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'coordinateur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id));

drop policy if exists "declinaisons_gouter: direction write" on public.declinaisons_gouter;
create policy "declinaisons_gouter: direction write" on public.declinaisons_gouter
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'coordinateur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id));

-- evaluations_stagiaire (lecture + écriture réservées à la direction)
drop policy if exists "evaluations_stagiaire: direction read" on public.evaluations_stagiaire;
create policy "evaluations_stagiaire: direction read" on public.evaluations_stagiaire
  for select
  using (public.current_role_name() in ('directeur', 'coordinateur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id));

drop policy if exists "evaluations_stagiaire: direction write" on public.evaluations_stagiaire;
create policy "evaluations_stagiaire: direction write" on public.evaluations_stagiaire
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id))
  with check (public.current_role_name() in ('directeur', 'coordinateur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id));

-- auto_evaluations_stagiaire (lecture direction)
drop policy if exists "auto_evaluations_stagiaire: direction ou le stagiaire lisent" on public.auto_evaluations_stagiaire;
create policy "auto_evaluations_stagiaire: direction ou le stagiaire lisent" on public.auto_evaluations_stagiaire
  for select
  using (
    (public.current_role_name() in ('directeur', 'coordinateur', 'gestionnaire') or public.est_mon_animateur(animateur_id))
    and public.dans_mon_etablissement(etablissement_id)
  );

-- messages : auteur ou direction peut supprimer
drop policy if exists "messages: author or directeur can delete" on public.messages;
create policy "messages: author or directeur can delete" on public.messages
  for delete using (
    auth.uid() = auteur_id
    or (public.current_role_name() in ('directeur', 'gestionnaire') and public.dans_mon_etablissement(etablissement_id))
  );
