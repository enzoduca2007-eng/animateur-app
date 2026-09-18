"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { ROLE_LABELS, type Message } from "@/lib/types";

export default function MessagesPage() {
  const profile = useProfile();
  const supabase = createClient();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("messages")
      .select("*, profiles(full_name, role)")
      .order("created_at", { ascending: false });
    if (data) setMessages(data as unknown as Message[]);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();

    const channel = supabase
      .channel("messages-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSending(true);
    await supabase
      .from("messages")
      .insert({ contenu: content.trim(), auteur_id: profile.id });
    setContent("");
    setSending(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce message ?")) return;
    await supabase.from("messages").delete().eq("id", id);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">
          Communication interne
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Visible par les 3 espaces : directeurs, coordinateurs, responsables.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row"
      >
        <textarea
          placeholder="Écrire un message à l'équipe..."
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
  );
}
