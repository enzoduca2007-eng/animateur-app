-- Permet à un compte d'avoir, en plus de son rôle principal (profiles.role),
-- un ou plusieurs rôles secondaires qu'il peut choisir d'endosser à la
-- connexion (ex : un coordinateur qui veut aussi pouvoir se connecter en
-- tant qu'animateur). Le rôle choisi à la connexion devient le rôle
-- *effectif* pour toute la session — y compris pour les permissions RLS,
-- pas juste l'affichage : current_role_name() est redéfinie pour le
-- renvoyer à la place du rôle principal.
--
-- Limite connue : le rôle actif est stocké par compte (role_actif), pas par
-- session/JWT. Si le même compte est connecté sur deux appareils en même
-- temps avec deux rôles différents, le dernier choisi l'emporte partout. Un
-- vrai cloisonnement par session demanderait un hook d'auth personnalisé
-- (custom claim JWT), pas fait ici.
--
-- Idempotente : peut être relancée sans erreur.

create table if not exists public.profil_roles_secondaires (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.user_role not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, role)
);

alter table public.profil_roles_secondaires enable row level security;

drop policy if exists "profil_roles_secondaires: owner can view" on public.profil_roles_secondaires;
create policy "profil_roles_secondaires: owner can view" on public.profil_roles_secondaires
  for select using (auth.uid() = profile_id);

-- Rôle choisi à la connexion, par compte. Modifié uniquement via la
-- fonction definir_role_actif() ci-dessous (pas de policy d'écriture : la
-- fonction security definer contourne RLS après avoir validé le rôle).
create table if not exists public.role_actif (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  role public.user_role not null,
  updated_at timestamptz not null default now()
);

alter table public.role_actif enable row level security;

drop policy if exists "role_actif: owner can view" on public.role_actif;
create policy "role_actif: owner can view" on public.role_actif
  for select using (auth.uid() = profile_id);

-- Remplace la version qui ne lisait que profiles.role : renvoie désormais
-- le rôle actif choisi à la connexion quand il est valide pour ce compte
-- (rôle principal ou secondaire), sinon retombe sur le rôle principal.
create or replace function public.current_role_name()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select ra.role
      from public.role_actif ra
      join public.profiles p on p.id = ra.profile_id
      where ra.profile_id = auth.uid()
        and (
          ra.role = p.role
          or exists (
            select 1 from public.profil_roles_secondaires s
            where s.profile_id = ra.profile_id and s.role = ra.role
          )
        )
    ),
    (select role from public.profiles where id = auth.uid())
  );
$$;

-- Appelée par l'écran de connexion juste après l'authentification, avec le
-- rôle choisi par l'utilisateur ("espace"). Échoue si ce rôle n'est ni le
-- rôle principal du compte ni un de ses rôles secondaires.
create or replace function public.definir_role_actif(p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role <> (select role from public.profiles where id = auth.uid())
     and not exists (
       select 1 from public.profil_roles_secondaires
       where profile_id = auth.uid() and role = p_role
     )
  then
    raise exception 'Rôle % non autorisé pour ce compte.', p_role;
  end if;

  insert into public.role_actif (profile_id, role)
  values (auth.uid(), p_role)
  on conflict (profile_id) do update set role = excluded.role, updated_at = now();
end;
$$;
