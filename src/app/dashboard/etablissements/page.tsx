"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { type Etablissement } from "@/lib/types";

const EMPTY_FORM = {
  nomEtablissement: "",
  gestionnaireNom: "",
  gestionnaireEmail: "",
  gestionnairePassword: "",
};

export default function EtablissementsPage() {
  const profile = useProfile();
  const router = useRouter();
  const supabase = createClient();

  // Un gestionnaire scopé à un établissement n'a rien à faire sur la liste
  // globale (réservée au gestionnaire sans établissement) — direction
  // automatique vers ses propres paramètres.
  useEffect(() => {
    if (profile.role === "gestionnaire" && profile.etablissement_id) {
      router.replace(`/dashboard/etablissements/${profile.etablissement_id}`);
    }
  }, [profile.role, profile.etablissement_id, router]);

  const [etablissements, setEtablissements] = useState<Etablissement[]>([]);
  const [comptesParEtablissement, setComptesParEtablissement] = useState<
    Record<string, number>
  >({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function charger() {
    setLoading(true);
    const [{ data: e }, { data: p }] = await Promise.all([
      supabase.from("etablissements").select("*").order("nom"),
      supabase.from("profiles").select("etablissement_id"),
    ]);
    setEtablissements((e as Etablissement[]) ?? []);
    const compteurs: Record<string, number> = {};
    for (const row of p ?? []) {
      const id = (row as { etablissement_id: string | null }).etablissement_id;
      if (!id) continue;
      compteurs[id] = (compteurs[id] ?? 0) + 1;
    }
    setComptesParEtablissement(compteurs);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);

    const res = await fetch("/api/etablissements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();

    setCreating(false);

    if (!res.ok) {
      setError(data.error ?? "Erreur inconnue.");
      return;
    }

    setShowForm(false);
    setForm(EMPTY_FORM);
    charger();
  }

  if (profile.role !== "gestionnaire" || profile.etablissement_id) {
    return (
      <p className="text-sm text-zinc-500">
        Cette page est réservée au compte gestionnaire global.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Établissements</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Chaque établissement a ses propres animateurs, plannings et
            réglages, totalement isolés des autres.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          {showForm ? "Annuler" : "+ Nouvel établissement"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="text-xs font-medium text-zinc-500">
              Nom de l&apos;établissement
            </label>
            <input
              required
              value={form.nomEtablissement}
              onChange={(e) =>
                setForm({ ...form, nomEtablissement: e.target.value })
              }
              placeholder="ex. Centre de loisirs Les Écureuils"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>

          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Premier compte gestionnaire de cet établissement
          </p>
          <p className="text-xs text-zinc-400">
            Ce compte gère uniquement cet établissement (comme un directeur,
            avec en plus les réglages avancés) — pas les autres.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              required
              placeholder="Nom complet"
              value={form.gestionnaireNom}
              onChange={(e) => setForm({ ...form, gestionnaireNom: e.target.value })}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              required
              type="email"
              placeholder="Email"
              value={form.gestionnaireEmail}
              onChange={(e) => setForm({ ...form, gestionnaireEmail: e.target.value })}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <input
              required
              type="password"
              minLength={6}
              placeholder="Mot de passe provisoire"
              value={form.gestionnairePassword}
              onChange={(e) =>
                setForm({ ...form, gestionnairePassword: e.target.value })
              }
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm sm:col-span-2"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={creating}
            className="mt-2 self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {creating ? "Création..." : "Créer l'établissement"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-zinc-400">Chargement...</p>
      ) : etablissements.length === 0 ? (
        <p className="text-sm text-zinc-400">Aucun établissement pour l&apos;instant.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {etablissements.map((e) => (
            <Link
              key={e.id}
              href={`/dashboard/etablissements/${e.id}`}
              className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300"
            >
              <div>
                <p className="font-medium text-zinc-900">{e.nom}</p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Créé le {new Date(e.created_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                {comptesParEtablissement[e.id] ?? 0} compte
                {(comptesParEtablissement[e.id] ?? 0) > 1 ? "s" : ""}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
