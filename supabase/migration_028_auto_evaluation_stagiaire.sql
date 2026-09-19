-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_027_appreciations_categories.sql. Ajoute l'auto-évaluation
-- en ligne du stagiaire (grille identique à celle de la direction),
-- pour la fusionner avec l'évaluation de la direction sur la même
-- feuille imprimée : les deux avis apparaissent côte à côte, et un
-- même niveau choisi des deux côtés est mis en évidence (les deux
-- couleurs).

create table public.auto_evaluations_stagiaire (
  id uuid primary key default gen_random_uuid(),
  animateur_id uuid not null unique references public.animateurs (id) on delete cascade,
  criteres jsonb not null default '{}'::jsonb,
  commentaire text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.auto_evaluations_stagiaire enable row level security;

-- La direction voit toutes les auto-évaluations (pour la fiche fusionnée) ;
-- le stagiaire ne voit (et n'écrit) que la sienne, via son compte.
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
