"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { ROLE_LABELS, type Message, type Role, type TypeConversation } from "@/lib/types";

interface ProfilLeger {
  id: string;
  full_name: string;
  role: Role;
}

interface ConversationAvecMembres {
  id: string;
  type: TypeConversation;
  nom: string | null;
  created_by: string | null;
  created_at: string;
  conversation_membres: { profile_id: string; profiles: ProfilLeger | null }[];
}

export default function MessagesPage() {
  const profile = useProfile();
  const supabase = createClient();

  const [conversations, setConversations] = useState<ConversationAvecMembres[]>([]);
  const [profils, setProfils] = useState<ProfilLeger[]>([]);
  const [conversationActive, setConversationActive] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const [modalOuvert, setModalOuvert] = useState(false);
  const [modalType, setModalType] = useState<TypeConversation>("direct");
  const [modalNom, setModalNom] = useState("");
  const [modalMembres, setModalMembres] = useState<string[]>([]);

  async function loadConversations() {
    const { data } = await supabase
      .from("conversations")
      .select("*, conversation_membres(profile_id, profiles(id, full_name, role))")
      .order("created_at", { ascending: false });
    setConversations((data as unknown as ConversationAvecMembres[]) ?? []);
  }

  async function loadMessages(conversationId: string | null) {
    setLoading(true);
    let query = supabase
      .from("messages")
      .select("*, profiles(full_name, role)")
      .order("created_at", { ascending: false });
    query = conversationId ? query.eq("conversation_id", conversationId) : query.is("conversation_id", null);
    const { data } = await query;
    setMessages((data as unknown as Message[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConversations();
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .neq("id", profile.id)
      .order("full_name")
      .then(({ data }) => setProfils((data as ProfilLeger[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMessages(conversationActive);

    const channel = supabase
      .channel(`messages-realtime-${conversationActive ?? "general"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => loadMessages(conversationActive)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationActive]);

  function libelleConversation(c: ConversationAvecMembres): string {
    if (c.type === "groupe") return c.nom || "Groupe";
    const autre = c.conversation_membres.find((m) => m.profile_id !== profile.id)?.profiles;
    return autre?.full_name ?? "Conversation";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSending(true);
    await supabase.from("messages").insert({
      contenu: content.trim(),
      auteur_id: profile.id,
      conversation_id: conversationActive,
    });
    setContent("");
    setSending(false);
    loadMessages(conversationActive);
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce message ?")) return;
    await supabase.from("messages").delete().eq("id", id);
    loadMessages(conversationActive);
  }

  function ouvrirNouvelleConversation(type: TypeConversation) {
    setModalType(type);
    setModalNom("");
    setModalMembres([]);
    setErreur(null);
    setModalOuvert(true);
  }

  function toggleMembre(id: string) {
    setModalMembres((prev) => {
      if (modalType === "direct") return prev.includes(id) ? [] : [id];
      return prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id];
    });
  }

  async function creerConversation() {
    setErreur(null);
    if (modalType === "direct") {
      if (modalMembres.length !== 1) return;
      const autreId = modalMembres[0];
      // Réutilise la conversation individuelle existante avec cette personne
      // plutôt que d'en recréer une vide à chaque fois.
      const existante = conversations.find(
        (c) =>
          c.type === "direct" &&
          c.conversation_membres.length === 2 &&
          c.conversation_membres.some((m) => m.profile_id === autreId)
      );
      if (existante) {
        setConversationActive(existante.id);
        setModalOuvert(false);
        return;
      }
    } else {
      if (!modalNom.trim() || modalMembres.length === 0) return;
    }

    const { data: conversation, error: erreurConversation } = await supabase
      .from("conversations")
      .insert({
        type: modalType,
        nom: modalType === "groupe" ? modalNom.trim() : null,
        created_by: profile.id,
      })
      .select()
      .single();
    if (erreurConversation || !conversation) {
      setErreur(erreurConversation?.message ?? "Impossible de créer la conversation.");
      return;
    }

    const { error: erreurMembres } = await supabase.from("conversation_membres").insert(
      [profile.id, ...modalMembres].map((profile_id) => ({
        conversation_id: conversation.id,
        profile_id,
      }))
    );
    if (erreurMembres) {
      setErreur(erreurMembres.message);
      return;
    }

    await loadConversations();
    setConversationActive(conversation.id);
    setModalOuvert(false);
  }

  async function quitterConversation(conversationId: string) {
    if (!confirm("Quitter cette conversation ?")) return;
    await supabase
      .from("conversation_membres")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("profile_id", profile.id);
    if (conversationActive === conversationId) setConversationActive(null);
    loadConversations();
  }

  const conversationCourante = useMemo(
    () => conversations.find((c) => c.id === conversationActive) ?? null,
    [conversations, conversationActive]
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Communication interne</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Le fil Général est visible par toute l&apos;équipe. Crée des messages
          individuels ou des groupes pour discuter à part.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <button
              onClick={() => ouvrirNouvelleConversation("direct")}
              className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              + Message
            </button>
            <button
              onClick={() => ouvrirNouvelleConversation("groupe")}
              className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              + Groupe
            </button>
          </div>

          <div className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm">
            <button
              onClick={() => setConversationActive(null)}
              className={`rounded-md px-3 py-2 text-left text-sm ${
                conversationActive === null
                  ? "bg-zinc-900 font-medium text-white"
                  : "text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              Général
            </button>
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setConversationActive(c.id)}
                className={`flex items-center gap-1 rounded-md px-3 py-2 text-left text-sm ${
                  conversationActive === c.id
                    ? "bg-zinc-900 font-medium text-white"
                    : "text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {c.type === "groupe" ? "👥 " : ""}
                {libelleConversation(c)}
              </button>
            ))}
            {conversations.length === 0 && (
              <p className="px-3 py-2 text-xs text-zinc-400">
                Aucun message individuel ou groupe pour l&apos;instant.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {erreur && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {erreur}
            </p>
          )}

          {conversationCourante && (
            <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-2 shadow-sm">
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  {libelleConversation(conversationCourante)}
                </p>
                {conversationCourante.type === "groupe" && (
                  <p className="text-xs text-zinc-400">
                    {conversationCourante.conversation_membres
                      .map((m) => m.profiles?.full_name)
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
              </div>
              <button
                onClick={() => quitterConversation(conversationCourante.id)}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Quitter
              </button>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row"
          >
            <textarea
              placeholder={
                conversationActive ? "Écrire un message..." : "Écrire un message à l'équipe..."
              }
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={2}
              className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={sending || !content.trim()}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              Envoyer
            </button>
          </form>

          <div className="flex flex-col gap-3">
            {loading ? (
              <p className="text-sm text-zinc-400">Chargement...</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-zinc-400">Aucun message pour l&apos;instant.</p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-zinc-900">
                      {m.profiles?.full_name ?? "Quelqu'un"}{" "}
                      {m.profiles?.role && (
                        <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-normal text-zinc-600">
                          {ROLE_LABELS[m.profiles.role]}
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-400">
                        {new Date(m.created_at).toLocaleString("fr-FR")}
                      </span>
                      {(m.auteur_id === profile.id || profile.role === "directeur") && (
                        <button
                          onClick={() => handleDelete(m.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Supprimer
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-zinc-700">{m.contenu}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {modalOuvert && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4"
          onClick={() => setModalOuvert(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-900">
                {modalType === "direct" ? "Nouveau message individuel" : "Nouveau groupe"}
              </p>
              <button
                onClick={() => setModalOuvert(false)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                ✕
              </button>
            </div>

            {modalType === "groupe" && (
              <>
                <label className="text-xs font-medium text-zinc-500">Nom du groupe</label>
                <input
                  autoFocus
                  value={modalNom}
                  onChange={(e) => setModalNom(e.target.value)}
                  placeholder="Ex: Équipe Lutins"
                  className="mt-1 mb-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </>
            )}

            <label className="text-xs font-medium text-zinc-500">
              {modalType === "direct" ? "Destinataire" : "Membres"}
            </label>
            <div className="mt-1 flex max-h-56 flex-col gap-1 overflow-y-auto">
              {profils.length === 0 ? (
                <p className="text-sm text-zinc-400">Aucun autre compte.</p>
              ) : (
                profils.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50"
                  >
                    <input
                      type={modalType === "direct" ? "radio" : "checkbox"}
                      name="membre"
                      checked={modalMembres.includes(p.id)}
                      onChange={() => toggleMembre(p.id)}
                    />
                    {p.full_name}
                    <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                      {ROLE_LABELS[p.role]}
                    </span>
                  </label>
                ))
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={creerConversation}
                disabled={
                  modalType === "direct"
                    ? modalMembres.length !== 1
                    : !modalNom.trim() || modalMembres.length === 0
                }
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
