-- Schema for the Animateur management app.
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).

create extension if not exists "pgcrypto";

create type public.user_role as enum ('directeur', 'coordinateur', 'responsable', 'animateur');

-- One row per account, created automatically on signup (see trigger below).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.user_role not null default 'responsable',
  -- Si renseigné, un coordinateur ne peut gérer que ce groupe (répartition,
  -- planning, effectifs, fiches horaires). Null = accès complet.
  groupe_coordinateur text check (groupe_coordinateur in ('lutins', 'trolls')),
  created_at timestamptz not null default now()
);

-- Reads the caller's own role. security definer lets it bypass profiles' RLS
-- so it can be used safely inside other tables' policies without recursion.
create or replace function public.current_role_name()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Auto-create a profile when someone signs up. full_name/role come from the
-- options.data passed to supabase.auth.signUp() on the signup form.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'responsable')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Prevent a non-directeur from promoting themselves, or from lifting
-- their own groupe_coordinateur restriction, by editing their own row.
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role_name() <> 'directeur' then
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

create trigger profiles_prevent_role_escalation
  before update on public.profiles
  for each row execute procedure public.prevent_role_self_escalation();

alter table public.profiles enable row level security;

create policy "profiles: readable by any signed-in user" on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "profiles: self can update own row" on public.profiles
  for update using (auth.uid() = id);

create policy "profiles: directeur manages all rows" on public.profiles
  for all using (public.current_role_name() = 'directeur')
  with check (public.current_role_name() = 'directeur');

-- Animateurs (the staff being scheduled, not the app accounts).
create table public.animateurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  prenom text not null,
  email text,
  telephone text,
  diplomes text,
  disponibilites text,
  statut text not null default 'actif',
  est_stagiaire boolean not null default false,
  stagiaire_confiance boolean not null default false,
  date_naissance date,
  notes text,
  formation text,
  profile_id uuid unique references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.animateurs enable row level security;

create policy "animateurs: readable by any signed-in user" on public.animateurs
  for select using (auth.role() = 'authenticated');

create policy "animateurs: directeur write" on public.animateurs
  for all using (public.current_role_name() = 'directeur')
  with check (public.current_role_name() = 'directeur');

-- Répartition quotidienne des animateurs sur les 2 groupes (Lutins /
-- Trolls & Géants, fusionnés en un seul groupe réel "trolls"), un
-- animateur ne peut être que dans un seul groupe par jour. Créée avant
-- creneaux/affectations_creneau/effectifs_jour/feuilles_temps car les
-- fonctions de restriction par groupe ci-dessous en dépendent.
create table public.affectations_jour (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  animateur_id uuid not null references public.animateurs (id) on delete cascade,
  groupe text not null check (groupe in ('lutins', 'trolls')),
  -- Sous-étiquette purement visuelle pour distinguer Trolls de Géants sur la
  -- page Répartition (saisie L/T/G) : ne change rien ailleurs dans
  -- l'application, qui continue de traiter les deux comme un seul groupe
  -- réel "trolls" (staffing, effectifs, goûters, scoping coordinateur...).
  sous_groupe text check (sous_groupe in ('trolls', 'geants')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (date, animateur_id)
);

alter table public.affectations_jour enable row level security;

create policy "affectations_jour: readable by any signed-in user" on public.affectations_jour
  for select using (auth.role() = 'authenticated');

-- Groupe auquel le coordinateur connecté est rattaché (null = pas de
-- restriction, y compris pour un directeur).
create or replace function public.mon_groupe_coordinateur()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select groupe_coordinateur from public.profiles where id = auth.uid();
$$;

-- Le groupe auquel un animateur est affecté un jour donné (via la
-- Répartition), pour les tables qui n'ont pas de colonne "groupe"
-- directe (planning, fiches horaires).
create or replace function public.groupe_de_ce_jour(p_animateur_id uuid, p_date date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select groupe from public.affectations_jour
  where animateur_id = p_animateur_id and date = p_date
  limit 1;
$$;

-- Vrai si l'utilisateur connecté peut gérer une ligne rattachée au
-- groupe p_groupe : toujours vrai pour un directeur, vrai pour un
-- coordinateur non restreint, vrai pour un coordinateur restreint
-- seulement si p_groupe correspond à son groupe.
create or replace function public.peut_gerer_groupe(p_groupe text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_role_name() = 'directeur'
    or (
      public.current_role_name() = 'coordinateur'
      and (
        public.mon_groupe_coordinateur() is null
        or public.mon_groupe_coordinateur() = p_groupe
      )
    );
$$;

-- La Répartition (qui décide du groupe de chacun) est réservée au
-- directeur : un coordinateur, même rattaché à un groupe, ne peut pas
-- y toucher (il gère seulement le planning/effectifs/fiches horaires
-- de son groupe une fois la répartition faite par le directeur).
create policy "affectations_jour: directeur write" on public.affectations_jour
  for all using (public.current_role_name() = 'directeur')
  with check (public.current_role_name() = 'directeur');

-- Créneaux horaires configurables (arrivées / pauses / départs) qui
-- forment les lignes de la grille de planning.
create table public.creneaux (
  id uuid primary key default gen_random_uuid(),
  libelle text not null,
  type text not null check (type in ('arrivee', 'pause', 'depart')),
  heure_debut time not null,
  heure_fin time, -- requis pour les créneaux de type "pause"
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.creneaux enable row level security;

create policy "creneaux: readable by any signed-in user" on public.creneaux
  for select using (auth.role() = 'authenticated');

create policy "creneaux: directeur/coordinateur write" on public.creneaux
  for all using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));

insert into public.creneaux (libelle, type, heure_debut, heure_fin, ordre) values
  ('7h20', 'arrivee', '07:20', null, 1),
  ('8h', 'arrivee', '08:00', null, 2),
  ('8h30', 'arrivee', '08:30', null, 3),
  ('11h30-12h30', 'pause', '11:30', '12:30', 1),
  ('12h30-13h30', 'pause', '12:30', '13:30', 2),
  ('13h-14h', 'pause', '13:00', '14:00', 3),
  ('13h30-14h30', 'pause', '13:30', '14:30', 4),
  ('17h', 'depart', '17:00', null, 1),
  ('17h30', 'depart', '17:30', null, 2),
  ('Fermeture 18h', 'depart', '18:00', null, 3),
  ('Fermeture 18h30', 'depart', '18:30', null, 4);

-- Qui est affecté à quel créneau, quel jour.
create table public.affectations_creneau (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  creneau_id uuid not null references public.creneaux (id) on delete cascade,
  animateur_id uuid not null references public.animateurs (id) on delete cascade,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (date, creneau_id, animateur_id)
);

alter table public.affectations_creneau enable row level security;

create policy "affectations_creneau: readable by any signed-in user" on public.affectations_creneau
  for select using (auth.role() = 'authenticated');

create policy "affectations_creneau: directeur/coordinateur write" on public.affectations_creneau
  for all using (public.peut_gerer_groupe(public.groupe_de_ce_jour(animateur_id, date)))
  with check (public.peut_gerer_groupe(public.groupe_de_ce_jour(animateur_id, date)));

-- Jours exceptionnellement fermés (en plus des week-ends), ex: un jour
-- encore compté comme vacances par le calendrier officiel mais où le
-- centre a en réalité déjà rouvert l'école.
create table public.jours_fermeture (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  motif text,
  created_at timestamptz not null default now()
);

alter table public.jours_fermeture enable row level security;

create policy "jours_fermeture: readable by any signed-in user" on public.jours_fermeture
  for select using (auth.role() = 'authenticated');

create policy "jours_fermeture: directeur/coordinateur write" on public.jours_fermeture
  for all using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));

-- Effectif d'enfants par jour et par groupe, pour calculer combien
-- d'animateurs doivent rester présents à l'ouverture/fermeture.
create table public.effectifs_jour (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  groupe text not null check (groupe in ('lutins', 'trolls')),
  effectif integer not null check (effectif >= 0),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (date, groupe)
);

alter table public.effectifs_jour enable row level security;

create policy "effectifs_jour: readable by any signed-in user" on public.effectifs_jour
  for select using (auth.role() = 'authenticated');

create policy "effectifs_jour: directeur/coordinateur write" on public.effectifs_jour
  for all using (public.peut_gerer_groupe(groupe))
  with check (public.peut_gerer_groupe(groupe));

-- Paliers d'encadrement : "à partir de X enfants, il faut Y animateurs
-- à l'ouverture/fermeture" — configurables, plus proche de la réalité
-- (arrivées échelonnées) qu'un simple ratio.
create table public.paliers_encadrement (
  id uuid primary key default gen_random_uuid(),
  effectif_min integer not null unique,
  nb_animateurs integer not null check (nb_animateurs >= 1),
  created_at timestamptz not null default now()
);

alter table public.paliers_encadrement enable row level security;

create policy "paliers_encadrement: readable by any signed-in user" on public.paliers_encadrement
  for select using (auth.role() = 'authenticated');

create policy "paliers_encadrement: directeur/coordinateur write" on public.paliers_encadrement
  for all using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));

insert into public.paliers_encadrement (effectif_min, nb_animateurs) values
  (0, 1),
  (16, 2),
  (31, 3);

-- Fiches horaires (pointage) : horaires réels + présence. Les horaires
-- prévisionnels viennent déjà du planning (affectations_creneau), pas
-- besoin de les dupliquer ici.
create table public.feuilles_temps (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  animateur_id uuid not null references public.animateurs (id) on delete cascade,
  present boolean not null default true,
  motif_absence text,
  heure_arrivee_reelle time,
  heure_depart_reelle time,
  commentaire text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (date, animateur_id)
);

alter table public.feuilles_temps enable row level security;

-- Un animateur ne peut modifier que ses propres fiches.
create or replace function public.est_mon_animateur(p_animateur_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.animateurs a
    where a.id = p_animateur_id and a.profile_id = auth.uid()
  );
$$;

create policy "feuilles_temps: readable by any signed-in user" on public.feuilles_temps
  for select using (auth.role() = 'authenticated');

create policy "feuilles_temps: directeur/coordinateur write" on public.feuilles_temps
  for all using (public.peut_gerer_groupe(public.groupe_de_ce_jour(animateur_id, date)))
  with check (public.peut_gerer_groupe(public.groupe_de_ce_jour(animateur_id, date)));

create policy "feuilles_temps: animateur writes their own" on public.feuilles_temps
  for all using (public.est_mon_animateur(animateur_id))
  with check (public.est_mon_animateur(animateur_id));

-- Communication interne (simple message board visible to all 3 espaces).
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  auteur_id uuid references public.profiles (id),
  contenu text not null,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "messages: readable by any signed-in user" on public.messages
  for select using (auth.role() = 'authenticated');

create policy "messages: any signed-in user can post as themselves" on public.messages
  for insert with check (auth.uid() = auteur_id);

create policy "messages: author or directeur can delete" on public.messages
  for delete using (auth.uid() = auteur_id or public.current_role_name() = 'directeur');

-- Traçabilité des goûters : un animateur affecté à un groupe un jour donné
-- importe la/les photo(s) de l'emballage (une ligne créée automatiquement
-- par photo), qu'une IA analyse pour en extraire le type de produit, la
-- marque, le nom du produit, le numéro de lot, la DLC/DLUO et la quantité.
-- Le directeur/coordinateur peut aussi créer une ligne à la main et
-- corriger le type de produit / la marque si l'IA se trompe.
create table public.gouters (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  groupe text not null check (groupe in ('lutins', 'trolls')),
  type_produit text,
  marque text,
  photo_url text,
  nom_produit text,
  numero_lot text,
  date_peremption date,
  quantite text,
  statut_ia text not null default 'en_attente' check (statut_ia in ('en_attente', 'traite', 'echec')),
  erreur_ia text,
  created_by uuid references public.profiles (id),
  rempli_par uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index gouters_date_groupe_idx on public.gouters (date, groupe);

alter table public.gouters enable row level security;

-- Un animateur affecté à ce groupe ce jour-là (via la Répartition) peut
-- créer une ligne (une photo importée = une ligne) et la mettre à jour —
-- le trigger ci-dessous l'empêche de déplacer la ligne vers un autre
-- groupe/jour, réservé au directeur/coordinateur ; le type de produit et
-- la marque restent modifiables par lui (l'IA les remplit à sa place) mais
-- pas par un tiers non affecté à ce groupe ce jour-là.
create or replace function public.est_affecte_ce_jour(p_groupe text, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.affectations_jour aj
    join public.animateurs a on a.id = aj.animateur_id
    where aj.groupe = p_groupe and aj.date = p_date and a.profile_id = auth.uid()
  );
$$;

create or replace function public.gouters_verrouille_champs_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.peut_gerer_groupe(old.groupe) then
    new.groupe := old.groupe;
    new.date := old.date;
    if not public.est_affecte_ce_jour(old.groupe, old.date) then
      new.type_produit := old.type_produit;
      new.marque := old.marque;
    end if;
  end if;
  return new;
end;
$$;

create trigger gouters_before_update
  before update on public.gouters
  for each row execute procedure public.gouters_verrouille_champs_admin();

create policy "gouters: readable by any signed-in user" on public.gouters
  for select using (auth.role() = 'authenticated');

-- Créer une ligne : le directeur/coordinateur (n'importe quel groupe qu'il
-- gère), ou un animateur affecté à ce groupe ce jour-là (une photo importée
-- = une ligne créée automatiquement).
create policy "gouters: insert" on public.gouters
  for insert
  with check (public.peut_gerer_groupe(groupe) or public.est_affecte_ce_jour(groupe, date));

create policy "gouters: update" on public.gouters
  for update
  using (public.peut_gerer_groupe(groupe) or public.est_affecte_ce_jour(groupe, date))
  with check (public.peut_gerer_groupe(groupe) or public.est_affecte_ce_jour(groupe, date));

create policy "gouters: directeur/coordinateur delete" on public.gouters
  for delete using (public.peut_gerer_groupe(groupe));

-- Bucket de stockage pour les photos d'emballage des goûters.
insert into storage.buckets (id, name, public)
values ('gouters', 'gouters', true)
on conflict (id) do nothing;

create policy "gouters storage: readable by anyone" on storage.objects
  for select using (bucket_id = 'gouters');

create policy "gouters storage: authenticated insert" on storage.objects
  for insert with check (bucket_id = 'gouters' and auth.role() = 'authenticated');

create policy "gouters storage: authenticated update" on storage.objects
  for update using (bucket_id = 'gouters' and auth.role() = 'authenticated');

create policy "gouters storage: authenticated delete" on storage.objects
  for delete using (bucket_id = 'gouters' and auth.role() = 'authenticated');

-- Planning d'activités pédagogiques : pour un groupe, un jour et un moment
-- (matin / temps calme / après-midi), une liste d'activités, chacune
-- pouvant être assignée à un ou plusieurs animateurs.
create table public.planning_activites (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  groupe text not null check (groupe in ('lutins', 'trolls')),
  moment text not null check (moment in ('matin', 'temps_calme', 'apres_midi')),
  ordre integer not null default 0,
  type_activite text check (type_activite in ('grand_jeu', 'manuelle', 'jeu', 'autre')),
  duree text,
  materiel text,
  libelle text not null,
  animateur_ids uuid[] not null default '{}',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index planning_activites_date_groupe_idx
  on public.planning_activites (date, groupe, moment, ordre);

alter table public.planning_activites enable row level security;

create policy "planning_activites: readable by any signed-in user" on public.planning_activites
  for select using (auth.role() = 'authenticated');

create policy "planning_activites: insert" on public.planning_activites
  for insert with check (public.peut_gerer_groupe(groupe));

-- Un animateur assigné à l'activité peut la mettre à jour (pour renseigner
-- le matériel et la durée de SA propre activité, notamment via sa fiche
-- d'animation), mais le trigger ci-dessous l'empêche de toucher à autre
-- chose que ces deux champs.
create or replace function public.est_dans_activite(p_animateur_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.animateurs a
    where a.profile_id = auth.uid() and a.id = any(p_animateur_ids)
  );
$$;

create or replace function public.planning_activites_verrouille_champs_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.peut_gerer_groupe(old.groupe) then
    new.date := old.date;
    new.groupe := old.groupe;
    new.moment := old.moment;
    new.ordre := old.ordre;
    new.libelle := old.libelle;
    new.type_activite := old.type_activite;
    new.animateur_ids := old.animateur_ids;
  end if;
  return new;
end;
$$;

create trigger planning_activites_before_update
  before update on public.planning_activites
  for each row execute procedure public.planning_activites_verrouille_champs_admin();

create policy "planning_activites: update" on public.planning_activites
  for update
  using (public.peut_gerer_groupe(groupe) or public.est_dans_activite(animateur_ids))
  with check (public.peut_gerer_groupe(groupe) or public.est_dans_activite(animateur_ids));

create policy "planning_activites: delete" on public.planning_activites
  for delete using (public.peut_gerer_groupe(groupe));

-- Thème de la semaine par groupe (la bulle affichée en haut du planning
-- d'activités imprimé).
create table public.themes_semaine (
  id uuid primary key default gen_random_uuid(),
  groupe text not null check (groupe in ('lutins', 'trolls')),
  semaine_debut date not null,
  theme text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (groupe, semaine_debut)
);

alter table public.themes_semaine enable row level security;

create policy "themes_semaine: readable by any signed-in user" on public.themes_semaine
  for select using (auth.role() = 'authenticated');

create policy "themes_semaine: write" on public.themes_semaine
  for all
  using (public.peut_gerer_groupe(groupe))
  with check (public.peut_gerer_groupe(groupe));

-- Présence jour par jour de chaque membre de l'équipe (directeur,
-- coordinateur, animateur), indépendante du groupe géré ce jour-là —
-- pour la feuille de présence imprimable de la Répartition. Réservé au
-- directeur (outil global RH/planning, pas scopé par groupe).
create table public.presence_jour (
  id uuid primary key default gen_random_uuid(),
  animateur_id uuid not null references public.animateurs (id) on delete cascade,
  date date not null,
  present boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (animateur_id, date)
);

alter table public.presence_jour enable row level security;

create policy "presence_jour: readable by any signed-in user" on public.presence_jour
  for select using (auth.role() = 'authenticated');

create policy "presence_jour: directeur write" on public.presence_jour
  for all
  using (public.current_role_name() = 'directeur')
  with check (public.current_role_name() = 'directeur');

-- Effectifs enfants séparés Trolls / Géants pour la feuille de présence
-- imprimable de la Répartition uniquement — n'affecte pas effectifs_jour
-- (qui reste la seule donnée utilisée pour le calcul du taux
-- d'encadrement sur Planning, toujours sur le groupe réel fusionné).
create table public.effectifs_sous_groupe (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  sous_groupe text not null check (sous_groupe in ('trolls', 'geants')),
  effectif integer not null check (effectif >= 0),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (date, sous_groupe)
);

alter table public.effectifs_sous_groupe enable row level security;

create policy "effectifs_sous_groupe: readable by any signed-in user" on public.effectifs_sous_groupe
  for select using (auth.role() = 'authenticated');

create policy "effectifs_sous_groupe: directeur write" on public.effectifs_sous_groupe
  for all
  using (public.current_role_name() = 'directeur')
  with check (public.current_role_name() = 'directeur');

-- Marque une fiche animateur comme "Directeur" ou "Coordinateur" pour la
-- feuille de présence imprimable de la Répartition, avec sa ou ses
-- sections (Lutins/Trolls/Géants — un coordinateur peut gérer plusieurs
-- groupes) si coordinateur — indépendant d'un compte utilisateur : la
-- personne peut être ajoutée sans avoir créé de compte. Purement pour
-- cet affichage, n'affecte pas les droits réels de l'application
-- (toujours basés sur profiles.role / profiles.groupe_coordinateur pour
-- qui a effectivement un compte).
create table public.direction_roster (
  id uuid primary key default gen_random_uuid(),
  animateur_id uuid not null unique references public.animateurs (id) on delete cascade,
  role_affiche text not null check (role_affiche in ('directeur', 'directeur_adjoint', 'coordinateur')),
  sections text[] not null default '{}',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint direction_roster_sections_valides check (
    sections <@ array['lutins', 'trolls', 'geants']::text[]
  )
);

alter table public.direction_roster enable row level security;

create policy "direction_roster: readable by any signed-in user" on public.direction_roster
  for select using (auth.role() = 'authenticated');

create policy "direction_roster: directeur write" on public.direction_roster
  for all
  using (public.current_role_name() = 'directeur')
  with check (public.current_role_name() = 'directeur');

-- Présence jour par jour du directeur/directeur adjoint sur la feuille
-- imprimable (saisie D/A dans la grille de Répartition, comme L/T/G pour
-- les groupes) — distincte d'affectations_jour car un directeur
-- n'appartient à aucun groupe réel (lutins/trolls).
create table public.presence_direction_jour (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  animateur_id uuid not null references public.animateurs (id) on delete cascade,
  role text not null check (role in ('directeur', 'adjoint')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (date, animateur_id)
);

alter table public.presence_direction_jour enable row level security;

create policy "presence_direction_jour: readable by any signed-in user" on public.presence_direction_jour
  for select using (auth.role() = 'authenticated');

create policy "presence_direction_jour: directeur write" on public.presence_direction_jour
  for all
  using (public.current_role_name() = 'directeur')
  with check (public.current_role_name() = 'directeur');

-- Gestion des stagiaires BAFA : une fiche d'évaluation par animateur
-- marqué "stagiaire" (grille de compétences + avis final +
-- appréciation), remplie par la direction en vue du bilan de stage
-- pratique. Contenu jugé sensible : contrairement à la plupart des
-- tables de l'app, la lecture est réservée à la direction
-- (directeur/coordinateur), pas à tout utilisateur connecté.
create table public.evaluations_stagiaire (
  id uuid primary key default gen_random_uuid(),
  animateur_id uuid not null unique references public.animateurs (id) on delete cascade,
  -- Un niveau par critère de la grille (clé = code du critère, valeur =
  -- 'a_travailler' | 'en_cours' | 'acquis'), stocké en jsonb plutôt qu'en
  -- colonnes pour ne pas avoir à migrer le schéma si la grille évolue.
  criteres jsonb not null default '{}'::jsonb,
  -- Une appréciation par grande catégorie (clé = code de la catégorie),
  -- en plus de l'appréciation générale ci-dessous.
  appreciations_categories jsonb not null default '{}'::jsonb,
  avis_final text check (avis_final in ('favorable', 'reserve', 'defavorable')),
  appreciation_generale text,
  axes_progres text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.evaluations_stagiaire enable row level security;

create policy "evaluations_stagiaire: direction read" on public.evaluations_stagiaire
  for select
  using (public.current_role_name() in ('directeur', 'coordinateur'));

create policy "evaluations_stagiaire: direction write" on public.evaluations_stagiaire
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));

-- Auto-évaluation du stagiaire, remplie en ligne par lui-même — même
-- grille de critères, fusionnée avec celle de la direction sur la
-- feuille imprimée. La direction voit toutes les auto-évaluations ; le
-- stagiaire ne voit (et n'écrit) que la sienne, via son compte.
create table public.auto_evaluations_stagiaire (
  id uuid primary key default gen_random_uuid(),
  animateur_id uuid not null unique references public.animateurs (id) on delete cascade,
  criteres jsonb not null default '{}'::jsonb,
  commentaire text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.auto_evaluations_stagiaire enable row level security;

create policy "auto_evaluations_stagiaire: direction ou le stagiaire lisent" on public.auto_evaluations_stagiaire
  for select
  using (
    public.current_role_name() in ('directeur', 'coordinateur')
    or public.est_mon_animateur(animateur_id)
  );

create policy "auto_evaluations_stagiaire: le stagiaire ecrit la sienne" on public.auto_evaluations_stagiaire
  for all
  using (public.est_mon_animateur(animateur_id))
  with check (public.est_mon_animateur(animateur_id));

-- Fiche d'animation d'un grand jeu (objectifs, lieu, déroulement...),
-- remplie par le(s) animateur(s) assigné(s) depuis Mon planning —
-- inspirée des fiches "JeSuisAnimateur.fr". Durée et matériel restent
-- sur planning_activites (déjà existants et déjà modifiables par
-- l'animateur assigné).
create table public.fiches_animation (
  id uuid primary key default gen_random_uuid(),
  planning_activite_id uuid not null unique references public.planning_activites (id) on delete cascade,
  age text,
  effectif text,
  lieu text,
  objectifs text,
  sensibilisation text,
  deroulement text,
  conclusion_rangement text,
  animateurs_requis text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fiches_animation enable row level security;

create policy "fiches_animation: readable by any signed-in user" on public.fiches_animation
  for select using (auth.role() = 'authenticated');

-- Même droit que pour modifier l'activité liée : la direction (du
-- groupe concerné) ou un animateur assigné à cette activité.
create or replace function public.peut_modifier_fiche_animation(p_planning_activite_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.planning_activites pa
    where pa.id = p_planning_activite_id
      and (
        public.peut_gerer_groupe(pa.groupe)
        or exists (
          select 1 from public.animateurs a
          where a.profile_id = auth.uid() and a.id = any(pa.animateur_ids)
        )
      )
  );
$$;

create policy "fiches_animation: write by assigned or direction" on public.fiches_animation
  for all
  using (public.peut_modifier_fiche_animation(planning_activite_id))
  with check (public.peut_modifier_fiche_animation(planning_activite_id));

-- Prévisionnel d'achats de goûters :
-- - un catalogue de produits de base (ex. "Bichocos") ;
-- - pour chaque produit, une ou plusieurs déclinaisons par marque (ex.
--   "LU" : 2/personne, paquet de 20 — "Carrefour" : 3/personne,
--   paquet de 24), chaque marque ayant sa propre quantité ;
-- - pour chaque (jour, groupe), plusieurs déclinaisons peuvent être
--   prévues à la fois (le goûter peut combiner plusieurs produits, et
--   diffère d'un groupe à l'autre le même jour).
create table public.produits_gouter (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  actif boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.produits_gouter enable row level security;

create policy "produits_gouter: readable by any signed-in user" on public.produits_gouter
  for select using (auth.role() = 'authenticated');

create policy "produits_gouter: direction write" on public.produits_gouter
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));

create table public.declinaisons_gouter (
  id uuid primary key default gen_random_uuid(),
  produit_id uuid not null references public.produits_gouter (id) on delete cascade,
  marque text not null,
  quantite_par_personne integer not null check (quantite_par_personne > 0),
  taille_paquet integer not null check (taille_paquet > 0),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.declinaisons_gouter enable row level security;

create policy "declinaisons_gouter: readable by any signed-in user" on public.declinaisons_gouter
  for select using (auth.role() = 'authenticated');

create policy "declinaisons_gouter: direction write" on public.declinaisons_gouter
  for all
  using (public.current_role_name() in ('directeur', 'coordinateur'))
  with check (public.current_role_name() in ('directeur', 'coordinateur'));

create table public.gouters_prevus (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  groupe text not null check (groupe in ('lutins', 'trolls')),
  declinaison_id uuid not null references public.declinaisons_gouter (id) on delete cascade,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (date, groupe, declinaison_id)
);

alter table public.gouters_prevus enable row level security;

create policy "gouters_prevus: readable by any signed-in user" on public.gouters_prevus
  for select using (auth.role() = 'authenticated');

create policy "gouters_prevus: write by group management" on public.gouters_prevus
  for all
  using (public.peut_gerer_groupe(groupe))
  with check (public.peut_gerer_groupe(groupe));

create table public.plannings_verrous (
  semaine_debut date primary key,
  verrouille_par uuid references public.profiles (id),
  verrouille_at timestamptz not null default now()
);

alter table public.plannings_verrous enable row level security;

create policy "plannings_verrous: readable by any signed-in user" on public.plannings_verrous
  for select using (auth.role() = 'authenticated');

create policy "plannings_verrous: directeur write" on public.plannings_verrous
  for all
  using (public.current_role_name() = 'directeur')
  with check (public.current_role_name() = 'directeur');

