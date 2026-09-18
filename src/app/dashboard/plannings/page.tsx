"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { useVacances } from "@/lib/use-vacances";
import { estJourOuvert } from "@/lib/vacances";
import { PeriodesVacances } from "@/components/periodes-vacances";
import { canManage, type Animateur, type Planning } from "@/lib/types";

const EMPTY_FORM = {
  titre: "",
  date: "",
  heure_debut: "",
  heure_fin: "",
  lieu: "",
  description: "",
};

export default function PlanningsPage() {
  const profile = useProfile();
  const supabase = createClient();
  const editable = canManage(profile.role);
  const { periodes, zone, loading: loadingVacances } = useVacances();

  const [plannings, setPlannings] = useState<Planning[]>([]);
  const [animateurs, setAnimateurs] = useState<Animateur[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedAnimateurs, setSelectedAnimateurs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase
        .from("plannings")
        .select("*, planning_animateurs(animateur_id)")
        .order("date", { ascending: true }),
      supabase.from("animateurs").select("*").order("nom"),
    ]);
    if (p) setPlannings(p as Planning[]);
    if (a) setAnimateurs(a as Animateur[]);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleAnimateur(id: string) {
    setSelectedAnimateurs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const { data: created, error: insertError } = await supabase
      .from("plannings")
      .insert({ ...form, created_by: profile.id })
      .select()
      .single();

    if (insertError || !created) {
      setError(insertError?.message ?? "Erreur lors de la création.");
      return;
    }

    if (selectedAnimateurs.length > 0) {
      await supabase.from("planning_animateurs").insert(
        selectedAnimateurs.map((animateur_id) => ({
          planning_id: created.id,
          animateur_id,
        }))
      );
    }

    setShowForm(false);
    setForm(EMPTY_FORM);
    setSelectedAnimateurs([]);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce planning ?")) return;
    await supabase.from("plannings").delete().eq("id", id);
    load();
  }

  function animateurName(id: string) {
    const a = animateurs.find((x) => x.id === id);
    return a ? `${a.prenom} ${a.nom}` : "?";
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Plannings</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {editable
              ? "Crée les activités et affecte les animateurs."
              : "Consulte le planning des activités."}
          </p>
        </div>
        {editable && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            + Nouvelle activité
          </button>
        )}
      </div>

      <PeriodesVacances periodes={periodes} zone={zone} loading={loadingVacances} />

      {showForm && editable && (
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:grid-cols-2"
        >
          <input
            placeholder="Titre de l'activité"
            required
            value={form.titre}
            onChange={(e) => setForm({ ...form, titre: e.target.value })}
            className="col-span-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <div>
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            {form.date &&
              !loadingVacances &&
              !estJourOuvert(form.date, periodes) && (
                <p className="mt-1 text-xs text-amber-600">
                  ⚠️ Cette date ne tombe pas dans une période de vacances
                  connue (zone {zone}) — vérifie qu&apos;elle est correcte.
                </p>
              )}
          </div>
          <input
            placeholder="Lieu"
            value={form.lieu}
            onChange={(e) => setForm({ ...form, lieu: e.target.value })}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            type="time"
            value={form.heure_debut}
            onChange={(e) => setForm({ ...form, heure_debut: e.target.value })}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            type="time"
            value={form.heure_fin}
            onChange={(e) => setForm({ ...form, heure_fin: e.target.value })}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="col-span-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />

          <div className="col-span-full">
            <p className="mb-2 text-sm font-medium text-zinc-700">
              Animateurs affectés
            </p>
            <div className="flex flex-wrap gap-2">
              {animateurs.map((a) => (
                <label
                  key={a.id}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
                    selectedAnimateurs.includes(a.id)
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 text-zinc-600"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={selectedAnimateurs.includes(a.id)}
                    onChange={() => toggleAnimateur(a.id)}
                  />
                  {a.prenom} {a.nom}
                </label>
              ))}
              {animateurs.length === 0 && (
                <p className="text-xs text-zinc-400">
                  Ajoute d&apos;abord des animateurs.
                </p>
              )}
            </div>
          </div>

          {error && <p className="col-span-full text-sm text-red-600">{error}</p>}

          <div className="col-span-full flex gap-2">
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Créer
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {loading ? (
          <p className="text-sm text-zinc-400">Chargement...</p>
        ) : plannings.length === 0 ? (
          <p className="text-sm text-zinc-400">Aucune activité planifiée.</p>
        ) : (
          plannings.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                    {new Date(p.date).toLocaleDateString("fr-FR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                    {p.heure_debut && ` · ${p.heure_debut.slice(0, 5)}`}
                    {p.heure_fin && ` - ${p.heure_fin.slice(0, 5)}`}
                  </p>
                  <h3 className="mt-1 font-medium text-zinc-900">{p.titre}</h3>
                  {p.lieu && (
                    <p className="text-sm text-zinc-500">📍 {p.lieu}</p>
                  )}
                  {p.description && (
                    <p className="mt-1 text-sm text-zinc-600">{p.description}</p>
                  )}
                  {p.planning_animateurs && p.planning_animateurs.length > 0 && (
                    <p className="mt-2 text-xs text-zinc-500">
                      {p.planning_animateurs
                        .map((pa) => animateurName(pa.animateur_id))
                        .join(", ")}
                    </p>
                  )}
                </div>
                {editable && (
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-sm text-red-500 hover:text-red-700"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
