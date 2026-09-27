-- Ajoute les codes I (Inclusif) et R (Roulant) à la grille de Répartition,
-- saisis comme D/A : un animateur inclusif ou roulant n'appartient à aucun
-- groupe réel ce jour-là, donc stocké dans presence_direction_jour plutôt
-- que dans affectations_jour (contrainte groupe limitée à lutins/trolls).
alter table public.presence_direction_jour
  drop constraint if exists presence_direction_jour_role_check;

alter table public.presence_direction_jour
  add constraint presence_direction_jour_role_check
  check (role in ('directeur', 'adjoint', 'inclusif', 'roulant'));
