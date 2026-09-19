-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_025_direction_adjoint_presence.sql. Ajoute la gestion des
-- stagiaires BAFA : une fiche d'évaluation par animateur marqué
-- "stagiaire" (grille de compétences + avis final + appréciation),
-- remplie par la direction en vue du bilan de stage pratique.
--
-- Contenu jugé sensible (évaluation personnelle) : contrairement à la
-- plupart des tables de l'app, la lecture est réservée à la direction
-- (directeur/coordinateur), pas à tout utilisateur connecté.

create table public.evaluations_stagiaire (
  id uuid primary key default gen_random_uuid(),
  animateur_id uuid not null unique references public.animateurs (id) on delete cascade,
  -- Un niveau par critère de la grille (clé = code du critère, valeur =
  -- 'a_travailler' | 'en_cours' | 'acquis'), stocké en jsonb plutôt qu'en
  -- colonnes pour ne pas avoir à migrer le schéma si la grille évolue.
  criteres jsonb not null default '{}'::jsonb,
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
