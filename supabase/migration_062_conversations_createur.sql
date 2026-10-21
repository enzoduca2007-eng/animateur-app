-- Corrige "new row violates row-level security policy for table
-- conversations" à la création d'une conversation (page Messages).
--
-- L'app crée la conversation puis la relit aussitôt (insert ... select) pour
-- récupérer son id, avant d'y ajouter les membres. Or la policy de lecture
-- n'autorisait que les membres : à cet instant le créateur n'est pas encore
-- membre, la relecture était refusée et Postgres rejetait toute l'insertion.
-- Le créateur peut désormais toujours voir les conversations qu'il a créées.
--
-- Idempotente : peut être relancée sans erreur.

drop policy if exists "conversations: members can view" on public.conversations;
create policy "conversations: members can view" on public.conversations
  for select using (
    public.dans_mon_etablissement(etablissement_id)
    and (auth.uid() = created_by or public.est_membre_conversation(id))
  );

notify pgrst, 'reload schema';
