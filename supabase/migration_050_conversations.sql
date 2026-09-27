-- Messagerie : messages individuels (1 à 1) et groupes créés librement, en
-- plus du fil général existant sur la page Messages (messages.conversation_id
-- null = général, visible par tout le monde comme avant).

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'groupe')),
  -- Nom du groupe (saisi à la création) ; null pour une conversation
  -- individuelle, dont le libellé affiché est calculé côté app à partir de
  -- l'autre membre.
  nom text,
  etablissement_id uuid not null references public.etablissements (id),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.conversations enable row level security;

create trigger conversations_etablissement_defaut
  before insert on public.conversations
  for each row execute procedure public.etablissement_id_par_defaut();

create table public.conversation_membres (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  etablissement_id uuid not null references public.etablissements (id),
  created_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

alter table public.conversation_membres enable row level security;

create trigger conversation_membres_etablissement_defaut
  before insert on public.conversation_membres
  for each row execute procedure public.etablissement_id_par_defaut();

-- security definer : une policy de conversation_membres qui s'auto-référence
-- (suis-je dans la liste des membres ?) boucle sinon sur elle-même.
create or replace function public.est_membre_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_membres
    where conversation_id = p_conversation_id and profile_id = auth.uid()
  );
$$;

create policy "conversations: members can view" on public.conversations
  for select using (
    public.dans_mon_etablissement(etablissement_id)
    and public.est_membre_conversation(id)
  );

create policy "conversations: any signed-in user can create" on public.conversations
  for insert with check (
    auth.uid() = created_by and public.dans_mon_etablissement(etablissement_id)
  );

create policy "conversations: creator can delete" on public.conversations
  for delete using (auth.uid() = created_by);

create policy "conversation_membres: members can view" on public.conversation_membres
  for select using (
    public.dans_mon_etablissement(etablissement_id)
    and public.est_membre_conversation(conversation_id)
  );

-- Seul le créateur de la conversation ajoute des membres, et uniquement au
-- moment de la création (pas d'ajout ultérieur pour l'instant).
create policy "conversation_membres: creator adds members" on public.conversation_membres
  for insert with check (
    public.dans_mon_etablissement(etablissement_id)
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = auth.uid()
    )
  );

create policy "conversation_membres: leave your own conversations" on public.conversation_membres
  for delete using (auth.uid() = profile_id);

alter table public.messages
  add column conversation_id uuid references public.conversations (id) on delete cascade;

drop policy if exists "messages: readable by any signed-in user" on public.messages;
create policy "messages: readable by any signed-in user" on public.messages
  for select using (
    public.dans_mon_etablissement(etablissement_id)
    and (conversation_id is null or public.est_membre_conversation(conversation_id))
  );

drop policy if exists "messages: any signed-in user can post as themselves" on public.messages;
create policy "messages: any signed-in user can post as themselves" on public.messages
  for insert with check (
    auth.uid() = auteur_id
    and public.dans_mon_etablissement(etablissement_id)
    and (conversation_id is null or public.est_membre_conversation(conversation_id))
  );
