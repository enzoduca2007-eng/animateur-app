-- Migration à exécuter dans le SQL Editor de Supabase après
-- migration_039_fk_created_by_set_null.sql.
--
-- tranches_age passe d'une ligne fixe par groupe (lutins/trolls, un seul
-- possible chacun) à une liste libre : un libellé texte + année min/max,
-- qu'on peut créer/supprimer librement — pour pouvoir distinguer Trolls et
-- Géants (fusionnés en un seul groupe partout ailleurs dans l'app) et,
-- plus généralement, ajouter d'autres tranches si besoin.
--
-- Idempotente : peut être relancée sans erreur.

alter table public.tranches_age add column if not exists libelle text;

update public.tranches_age
  set libelle = coalesce(
    libelle,
    case groupe when 'lutins' then 'Lutins' when 'trolls' then 'Trolls' else groupe end
  )
  where libelle is null;

alter table public.tranches_age alter column libelle set not null;

alter table public.tranches_age drop constraint if exists tranches_age_etablissement_id_groupe_key;
alter table public.tranches_age drop constraint if exists tranches_age_groupe_check;
alter table public.tranches_age drop column if exists groupe;
