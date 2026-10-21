-- Signature quotidienne des présences : chaque jour, l'animateur signe sur
-- son téléphone (Mon planning). La signature (image PNG en data URL) est
-- reprise dans la colonne "Présence (signature)" de la fiche horaire
-- imprimée.
--
-- Table séparée de feuilles_temps : signer ne crée pas de pointage (pas
-- d'heures réelles inventées) et l'animateur ne peut toujours pas modifier
-- ses horaires — seulement sa signature, et seulement pour le jour même.
--
-- Idempotente : peut être relancée sans erreur.

create table if not exists public.signatures_presence (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements (id),
  date date not null,
  animateur_id uuid not null references public.animateurs (id) on delete cascade,
  signature text not null check (signature like 'data:image/png;base64,%' and length(signature) < 300000),
  signe_le timestamptz not null default now(),
  unique (etablissement_id, date, animateur_id)
);

alter table public.signatures_presence enable row level security;

drop trigger if exists signatures_presence_etablissement_defaut on public.signatures_presence;
create trigger signatures_presence_etablissement_defaut
  before insert on public.signatures_presence
  for each row execute procedure public.etablissement_id_par_defaut();

drop policy if exists "signatures_presence: lisible dans l'établissement" on public.signatures_presence;
create policy "signatures_presence: lisible dans l'établissement" on public.signatures_presence
  for select using (public.dans_mon_etablissement(etablissement_id));

-- L'animateur signe (ou re-signe) uniquement pour lui-même et pour le jour
-- même (heure de Paris).
drop policy if exists "signatures_presence: animateur signe le jour même" on public.signatures_presence;
create policy "signatures_presence: animateur signe le jour même" on public.signatures_presence
  for all
  using (
    public.est_mon_animateur(animateur_id)
    and public.dans_mon_etablissement(etablissement_id)
    and date = (now() at time zone 'Europe/Paris')::date
  )
  with check (
    public.est_mon_animateur(animateur_id)
    and public.dans_mon_etablissement(etablissement_id)
    and date = (now() at time zone 'Europe/Paris')::date
  );

-- Direction / coordination : peut effacer une signature (ex. signée par
-- erreur) pour les animateurs qu'elle gère, mais pas signer à leur place.
drop policy if exists "signatures_presence: direction efface" on public.signatures_presence;
create policy "signatures_presence: direction efface" on public.signatures_presence
  for delete using (
    public.peut_gerer_groupe(public.groupe_de_ce_jour(animateur_id, date))
    and public.dans_mon_etablissement(etablissement_id)
  );
