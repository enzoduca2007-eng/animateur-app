-- Signatures de l'animateur :
-- 1. chaque jour, il signe sa présence en scannant le QR code du jour,
--    affiché à la MJC (feuille imprimée chaque semaine par la direction /
--    coordination depuis Fiches horaires). Un jour passé oublié peut être
--    signé en scannant son QR code plus tard ; un jour à venir, non ;
-- 2. en fin de semaine, il signe sa fiche de la semaine (horaires +
--    présences) dans Mon planning, reprise dans les cases "Signature de
--    l'employé" de la fiche horaire imprimée. Refusée tant qu'un jour
--    pointé "présent" n'a pas sa signature de présence.
--
-- Idempotente : peut être relancée sans erreur.

-- 1a. QR codes de présence : un jeton secret par jour et par établissement.
create table if not exists public.qr_presence (
  jeton text primary key default replace(gen_random_uuid()::text, '-', ''),
  etablissement_id uuid not null references public.etablissements (id),
  date date not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (etablissement_id, date)
);

alter table public.qr_presence enable row level security;

drop trigger if exists qr_presence_etablissement_defaut on public.qr_presence;
create trigger qr_presence_etablissement_defaut
  before insert on public.qr_presence
  for each row execute procedure public.etablissement_id_par_defaut();

-- Seules la direction et la coordination voient / créent les jetons : un
-- animateur ne doit pas pouvoir les lire sans être passé à la MJC.
drop policy if exists "qr_presence: direction" on public.qr_presence;
create policy "qr_presence: direction" on public.qr_presence
  for all
  using (
    public.current_role_name() in ('directeur', 'coordinateur')
    and public.dans_mon_etablissement(etablissement_id)
  )
  with check (
    public.current_role_name() in ('directeur', 'coordinateur')
    and public.dans_mon_etablissement(etablissement_id)
  );

-- 1b. Plus d'écriture directe de l'animateur dans signatures_presence :
--     il passe obligatoirement par signer_presence_qr().
drop policy if exists "signatures_presence: animateur signe le jour même" on public.signatures_presence;
drop policy if exists "signatures_presence: animateur signe" on public.signatures_presence;

-- Date du QR code scanné (la page de signature l'affiche avant de signer).
create or replace function public.qr_presence_date(p_jeton text)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select date from public.qr_presence where jeton = p_jeton;
$$;

create or replace function public.signer_presence_qr(p_jeton text, p_signature text)
returns public.signatures_presence
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qr public.qr_presence;
  v_animateur uuid;
  v_resultat public.signatures_presence;
begin
  select * into v_qr from public.qr_presence where jeton = p_jeton;
  if not found then
    raise exception 'QR code invalide.';
  end if;
  if v_qr.date > (now() at time zone 'Europe/Paris')::date then
    raise exception 'Ce QR code est celui du %, pas encore signable.', to_char(v_qr.date, 'DD/MM');
  end if;

  select id into v_animateur from public.animateurs
  where profile_id = auth.uid() and etablissement_id = v_qr.etablissement_id;
  if v_animateur is null then
    raise exception 'Aucune fiche animateur liée à ce compte dans cet établissement.';
  end if;

  if p_signature is null
     or p_signature not like 'data:image/png;base64,%'
     or length(p_signature) >= 300000 then
    raise exception 'Signature invalide.';
  end if;

  insert into public.signatures_presence (etablissement_id, date, animateur_id, signature, signe_le)
  values (v_qr.etablissement_id, v_qr.date, v_animateur, p_signature, now())
  on conflict (etablissement_id, date, animateur_id)
  do update set signature = excluded.signature, signe_le = now()
  returning * into v_resultat;

  return v_resultat;
end;
$$;

revoke all on function public.signer_presence_qr(text, text) from public, anon;
grant execute on function public.signer_presence_qr(text, text) to authenticated;
revoke all on function public.qr_presence_date(text) from public, anon;
grant execute on function public.qr_presence_date(text) to authenticated;

-- ============================================================
-- 2. Signature de la semaine.
-- ============================================================
create table if not exists public.signatures_semaine (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements (id),
  animateur_id uuid not null references public.animateurs (id) on delete cascade,
  -- 1er et dernier jour ouvré de la semaine (même découpage que
  -- semainesDe() côté app : une semaine peut commencer un mercredi en
  -- début de période).
  semaine_debut date not null,
  semaine_fin date not null,
  signature text not null check (signature like 'data:image/png;base64,%' and length(signature) < 300000),
  signe_le timestamptz not null default now(),
  check (semaine_fin >= semaine_debut and semaine_fin - semaine_debut <= 6),
  unique (etablissement_id, animateur_id, semaine_debut)
);

alter table public.signatures_semaine enable row level security;

drop trigger if exists signatures_semaine_etablissement_defaut on public.signatures_semaine;
create trigger signatures_semaine_etablissement_defaut
  before insert on public.signatures_semaine
  for each row execute procedure public.etablissement_id_par_defaut();

-- Vrai si tous les jours pointés "présent" de l'animateur sur la plage ont
-- leur signature de présence.
create or replace function public.presences_toutes_signees(
  p_animateur_id uuid,
  p_debut date,
  p_fin date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.feuilles_temps f
    where f.animateur_id = p_animateur_id
      and f.date between p_debut and p_fin
      and f.present
      and not exists (
        select 1 from public.signatures_presence s
        where s.animateur_id = f.animateur_id
          and s.date = f.date
          and s.etablissement_id = f.etablissement_id
      )
  );
$$;

drop policy if exists "signatures_semaine: lisible dans l'établissement" on public.signatures_semaine;
create policy "signatures_semaine: lisible dans l'établissement" on public.signatures_semaine
  for select using (public.dans_mon_etablissement(etablissement_id));

-- L'animateur signe sa propre semaine, une fois arrivé à son dernier jour,
-- et seulement si toutes ses présences sont signées.
drop policy if exists "signatures_semaine: animateur signe" on public.signatures_semaine;
create policy "signatures_semaine: animateur signe" on public.signatures_semaine
  for all
  using (
    public.est_mon_animateur(animateur_id)
    and public.dans_mon_etablissement(etablissement_id)
  )
  with check (
    public.est_mon_animateur(animateur_id)
    and public.dans_mon_etablissement(etablissement_id)
    and semaine_fin <= (now() at time zone 'Europe/Paris')::date
    and public.presences_toutes_signees(animateur_id, semaine_debut, semaine_fin)
  );

-- Direction / coordination : peut effacer une signature de semaine (ex.
-- pointage corrigé après coup), pas signer à la place de l'animateur.
drop policy if exists "signatures_semaine: direction efface" on public.signatures_semaine;
create policy "signatures_semaine: direction efface" on public.signatures_semaine
  for delete using (
    public.current_role_name() in ('directeur', 'coordinateur')
    and public.dans_mon_etablissement(etablissement_id)
  );
