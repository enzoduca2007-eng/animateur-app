"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import {
  TYPE_CRENEAU_LABELS,
  type Creneau,
  type Etablissement,
  type JourFermeture,
  type PalierEncadrement,
  type TypeCreneau,
} from "@/lib/types";

const TYPES: TypeCreneau[] = ["arrivee", "pause", "depart"];

const EMPTY_CRENEAU_FORM = {
  libelle: "",
  type: "arrivee" as TypeCreneau,
  heure_debut: "",
  heure_fin: "",
};

export default function ParametresEtablissementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const profile = useProfile();
  const supabase = createClient();

  const [etablissement, setEtablissement] = useState<Etablissement | null>(null);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [paliers, setPaliers] = useState<PalierEncadrement[]>([]);
  const [joursFermeture, setJoursFermeture] = useState<JourFermeture[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [formCreneau, setFormCreneau] = useState(EMPTY_CRENEAU_FORM);
  const [formPalier, setFormPalier] = useState({ effectif_min: "", nb_animateurs: "" });
  const [formFermeture, setFormFermeture] = useState({ date: "", motif: "" });

  async function charger() {
    setLoading(true);
    const [{ data: e }, { data: c }, { data: p }, { data: f }] = await Promise.all([
      supabase.from("etablissements").select("*").eq("id", id).single(),
      supabase.from("creneaux").select("*").eq("etablissement_id", id).order("type").order("heure_debut"),
      supabase.from("paliers_encadrement").select("*").eq("etablissement_id", id).order("effectif_min"),
      supabase.from("jours_fermeture").select("*").eq("etablissement_id", id).order("date"),
    ]);
    setEtablissement((e as Etablissement) ?? null);
    setCreneaux((c as Creneau[]) ?? []);
    setPaliers((p as PalierEncadrement[]) ?? []);
    setJoursFermeture((f as JourFermeture[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (profile.role !== "gestionnaire") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function ajouterCreneau(e: React.FormEvent) {
    e.preventDefault();
    if (!formCreneau.libelle || !formCreneau.heure_debut) return;
    const { error } = await supabase.from("creneaux").insert({
      libelle: formCreneau.libelle,
      type: formCreneau.type,
      heure_debut: formCreneau.heure_debut,
      heure_fin: formCreneau.type === "pause" ? formCreneau.heure_fin || null : null,
      etablissement_id: id,
    });
    if (error) {
      setErreur(error.message);
      return;
    }
    setFormCreneau(EMPTY_CRENEAU_FORM);
    charger();
  }

  async function supprimerCreneau(creneauId: string) {
    if (!confirm("Supprimer ce créneau ? Les affectations liées seront perdues.")) return;
    await supabase.from("creneaux").delete().eq("id", creneauId);
    charger();
  }

  async function ajouterPalier(e: React.FormEvent) {
    e.preventDefault();
    const effectif_min = Number(formPalier.effectif_min);
    const nb_animateurs = Number(formPalier.nb_animateurs);
    if (!Number.isFinite(effectif_min) || !Number.isFinite(nb_animateurs) || nb_animateurs < 1)
      return;
    const { error } = await supabase
      .from("paliers_encadrement")
      .upsert(
        { effectif_min, nb_animateurs, etablissement_id: id },
        { onConflict: "etablissement_id,effectif_min" }
      );
    if (error) {
      setErreur(error.message);
      return;
    }
    setFormPalier({ effectif_min: "", nb_animateurs: "" });
    charger();
  }

  async function supprimerPalier(palierId: string) {
    await supabase.from("paliers_encadrement").delete().eq("id", palierId);
    charger();
  }

  async function ajouterFermeture(e: React.FormEvent) {
    e.preventDefault();
    if (!formFermeture.date) return;
    const { error } = await supabase.from("jours_fermeture").insert({
      date: formFermeture.date,
      motif: formFermeture.motif || null,
      etablissement_id: id,
    });
    if (error) {
      setErreur(error.message);
      return;
    }
    setFormFermeture({ date: "", motif: "" });
    charger();
  }

  async function supprimerFermeture(fermetureId: string) {
    await supabase.from("jours_fermeture").delete().eq("id", fermetureId);
    charger();
  }

  if (profile.role !== "gestionnaire") {
    return (
      <p className="text-sm text-zinc-500">
        Cette page est réservée au compte gestionnaire.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/etablissements"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← Établissements
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">
          {loading ? "..." : etablissement?.nom ?? "Établissement introuvable"}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Paramètres (créneaux, paliers d&apos;encadrement, jours de
          fermeture) — les groupes/âges ne sont pas encore configurables.
        </p>
      </div>

      {erreur && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {erreur}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-400">Chargement...</p>
      ) : (
        <>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="mb-1 text-sm font-medium text-zinc-900">
              Paliers d&apos;encadrement (ouverture/fermeture)
            </p>
            <p className="mb-3 text-xs text-zinc-500">
              À partir de X enfants, combien d&apos;animateurs sont
              nécessaires à l&apos;ouverture/fermeture.
            </p>
            {paliers.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {paliers.map((p) => (
                  <span
                    key={p.id}
                    className="flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700"
                  >
                    ≥ {p.effectif_min} enfants → {p.nb_animateurs} anim
                    {p.nb_animateurs > 1 ? "s" : ""}
                    <button
                      onClick={() => supprimerPalier(p.id)}
                      className="text-zinc-400 hover:text-red-600"
                      title="Supprimer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <form onSubmit={ajouterPalier} className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-xs text-zinc-500">À partir de (enfants)</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={formPalier.effectif_min}
                  onChange={(e) => setFormPalier({ ...formPalier, effectif_min: e.target.value })}
                  className="w-28 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500">Animateurs requis</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={formPalier.nb_animateurs}
                  onChange={(e) =>
                    setFormPalier({ ...formPalier, nb_animateurs: e.target.value })
                  }
                  className="w-28 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </div>
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                + Ajouter
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-medium text-zinc-900">Créneaux</p>
            <div className="flex flex-col gap-2">
              {TYPES.map((type) => (
                <div key={type} className="flex flex-wrap items-center gap-2">
                  <span className="w-20 text-xs font-medium text-zinc-400">
                    {TYPE_CRENEAU_LABELS[type]}
                  </span>
                  {creneaux
                    .filter((c) => c.type === type)
                    .map((c) => (
                      <span
                        key={c.id}
                        className="flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700"
                      >
                        {c.libelle}
                        <button
                          onClick={() => supprimerCreneau(c.id)}
                          className="text-zinc-400 hover:text-red-600"
                          title="Supprimer"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                </div>
              ))}
            </div>

            <form onSubmit={ajouterCreneau} className="mt-4 flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-xs text-zinc-500">Libellé</label>
                <input
                  placeholder="Ex: 9h ou Fermeture 19h"
                  value={formCreneau.libelle}
                  onChange={(e) => setFormCreneau({ ...formCreneau, libelle: e.target.value })}
                  className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500">Type</label>
                <select
                  value={formCreneau.type}
                  onChange={(e) =>
                    setFormCreneau({ ...formCreneau, type: e.target.value as TypeCreneau })
                  }
                  className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_CRENEAU_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500">
                  Heure {formCreneau.type === "pause" ? "début" : ""}
                </label>
                <input
                  type="time"
                  required
                  value={formCreneau.heure_debut}
                  onChange={(e) =>
                    setFormCreneau({ ...formCreneau, heure_debut: e.target.value })
                  }
                  className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </div>
              {formCreneau.type === "pause" && (
                <div>
                  <label className="block text-xs text-zinc-500">Heure fin</label>
                  <input
                    type="time"
                    required
                    value={formCreneau.heure_fin}
                    onChange={(e) =>
                      setFormCreneau({ ...formCreneau, heure_fin: e.target.value })
                    }
                    className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                </div>
              )}
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                + Ajouter
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-medium text-zinc-900">
              Jours exceptionnellement fermés
            </p>
            {joursFermeture.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {joursFermeture.map((f) => (
                  <span
                    key={f.id}
                    className="flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700"
                  >
                    {f.date}
                    {f.motif && ` · ${f.motif}`}
                    <button
                      onClick={() => supprimerFermeture(f.id)}
                      className="text-zinc-400 hover:text-red-600"
                      title="Supprimer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <form onSubmit={ajouterFermeture} className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-xs text-zinc-500">Date</label>
                <input
                  type="date"
                  required
                  value={formFermeture.date}
                  onChange={(e) => setFormFermeture({ ...formFermeture, date: e.target.value })}
                  className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500">Motif (optionnel)</label>
                <input
                  placeholder="Ex: Rentrée scolaire"
                  value={formFermeture.motif}
                  onChange={(e) =>
                    setFormFermeture({ ...formFermeture, motif: e.target.value })
                  }
                  className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </div>
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                + Ajouter
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
