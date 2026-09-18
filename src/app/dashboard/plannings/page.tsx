"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { useVacances } from "@/lib/use-vacances";
import { estWeekend, joursDe, periodeEnCours } from "@/lib/vacances";
import { formatHeures, heuresJour } from "@/lib/creneaux";
import { PeriodesVacances } from "@/components/periodes-vacances";
import {
  canManage,
  GROUPES,
  GROUPE_LABELS,
  TYPE_CRENEAU_LABELS,
  type AffectationCreneau,
  type AffectationJour,
  type Animateur,
  type Creneau,
  type Groupe,
  type TypeCreneau,
} from "@/lib/types";

const TYPES: TypeCreneau[] = ["arrivee", "pause", "depart"];

const EMPTY_CRENEAU_FORM = {
  libelle: "",
  type: "arrivee" as TypeCreneau,
  heure_debut: "",
  heure_fin: "",
};

function formatJourCourt(dateISO: string) {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function PlanningsPage() {
  const profile = useProfile();
  const supabase = createClient();
  const editable = canManage(profile.role);
  const { periodes, zone, loading: loadingVacances } = useVacances();

  const [animateurs, setAnimateurs] = useState<Animateur[]>([]);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [affectations, setAffectations] = useState<AffectationCreneau[]>([]);
  const [affectationsJour, setAffectationsJour] = useState<AffectationJour[]>([]);
  const [periodeIndex, setPeriodeIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [celluleOuverte, setCelluleOuverte] = useState<
    { creneauId: string; date: string; groupe: Groupe } | null
  >(null);
  const [showCreneaux, setShowCreneaux] = useState(false);
  const [formCreneau, setFormCreneau] = useState(EMPTY_CRENEAU_FORM);

  async function chargerCreneaux() {
    const { data } = await supabase
      .from("creneaux")
      .select("*")
      .order("type")
      .order("ordre");
    if (data) setCreneaux(data as Creneau[]);
  }

  useEffect(() => {
    supabase
      .from("animateurs")
      .select("*")
      .eq("statut", "actif")
      .order("nom")
      .then(({ data }) => {
        if (data) setAnimateurs(data as Animateur[]);
      });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    chargerCreneaux();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loadingVacances || periodes.length === 0 || periodeIndex !== null)
      return;
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const defaut = periodeEnCours(periodes, aujourdhui);
    const index = periodes.findIndex((p) => p === defaut);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPeriodeIndex(index >= 0 ? index : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingVacances, periodes]);

  const periode = periodeIndex !== null ? periodes[periodeIndex] : null;
  const jours = useMemo(() => (periode ? joursDe(periode) : []), [periode]);

  async function loadAffectations(debut: string, fin: string) {
    setLoading(true);
    const [{ data: c }, { data: j }] = await Promise.all([
      supabase
        .from("affectations_creneau")
        .select("*")
        .gte("date", debut)
        .lte("date", fin),
      supabase
        .from("affectations_jour")
        .select("*")
        .gte("date", debut)
        .lte("date", fin),
    ]);
    setAffectations((c as AffectationCreneau[]) ?? []);
    setAffectationsJour((j as AffectationJour[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (periode) loadAffectations(periode.debut, periode.fin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode]);

  const animateursParCellule = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of affectations) {
      const cle = `${a.creneau_id}|${a.date}`;
      map.set(cle, [...(map.get(cle) ?? []), a.animateur_id]);
    }
    return map;
  }, [affectations]);

  function animateursDe(creneauId: string, date: string) {
    return animateursParCellule.get(`${creneauId}|${date}`) ?? [];
  }

  const animateursParGroupeJour = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of affectationsJour) {
      const cle = `${a.groupe}|${a.date}`;
      map.set(cle, [...(map.get(cle) ?? []), a.animateur_id]);
    }
    return map;
  }, [affectationsJour]);

  function animateursDuGroupe(groupe: Groupe, date: string) {
    return animateursParGroupeJour.get(`${groupe}|${date}`) ?? [];
  }

  async function toggleAffectation(
    creneauId: string,
    date: string,
    animateurId: string,
    assigne: boolean
  ) {
    setErreur(null);
    setAffectations((prev) =>
      assigne
        ? [
            ...prev,
            {
              id: `optimistic-${creneauId}-${date}-${animateurId}`,
              date,
              creneau_id: creneauId,
              animateur_id: animateurId,
              created_by: profile.id,
              created_at: new Date().toISOString(),
            },
          ]
        : prev.filter(
            (a) =>
              !(
                a.creneau_id === creneauId &&
                a.date === date &&
                a.animateur_id === animateurId
              )
          )
    );

    if (assigne) {
      const { error } = await supabase.from("affectations_creneau").upsert(
        { date, creneau_id: creneauId, animateur_id: animateurId, created_by: profile.id },
        { onConflict: "date,creneau_id,animateur_id" }
      );
      if (error) setErreur(error.message);
    } else {
      const { error } = await supabase
        .from("affectations_creneau")
        .delete()
        .eq("date", date)
        .eq("creneau_id", creneauId)
        .eq("animateur_id", animateurId);
      if (error) setErreur(error.message);
    }
  }

  async function ajouterCreneau(e: React.FormEvent) {
    e.preventDefault();
    if (!formCreneau.libelle || !formCreneau.heure_debut) return;
    const ordre =
      Math.max(
        0,
        ...creneaux.filter((c) => c.type === formCreneau.type).map((c) => c.ordre)
      ) + 1;

    const { error } = await supabase.from("creneaux").insert({
      libelle: formCreneau.libelle,
      type: formCreneau.type,
      heure_debut: formCreneau.heure_debut,
      heure_fin: formCreneau.type === "pause" ? formCreneau.heure_fin || null : null,
      ordre,
    });
    if (error) {
      setErreur(error.message);
      return;
    }
    setFormCreneau(EMPTY_CRENEAU_FORM);
    chargerCreneaux();
  }

  async function supprimerCreneau(id: string) {
    if (!confirm("Supprimer ce créneau ? Les affectations liées seront perdues."))
      return;
    await supabase.from("creneaux").delete().eq("id", id);
    chargerCreneaux();
  }

  // Total d'heures par animateur sur la période affichée.
  const heuresParAnimateur = useMemo(() => {
    const totaux = new Map<string, number>();
    for (const a of animateurs) {
      let total = 0;
      for (const j of jours) {
        if (estWeekend(j)) continue;
        const ids = new Set(
          affectations
            .filter((aff) => aff.date === j && aff.animateur_id === a.id)
            .map((aff) => aff.creneau_id)
        );
        const creneauxAssignes = creneaux.filter((c) => ids.has(c.id));
        const h = heuresJour(creneauxAssignes);
        if (h) total += h;
      }
      totaux.set(a.id, total);
    }
    return totaux;
  }, [animateurs, jours, affectations, creneaux]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Planning</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {editable
              ? "Clique une case pour affecter des animateurs à un créneau."
              : "Consulte qui est présent à chaque créneau."}
          </p>
        </div>
        {editable && (
          <button
            onClick={() => setShowCreneaux((v) => !v)}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {showCreneaux ? "Fermer les créneaux" : "Gérer les créneaux"}
          </button>
        )}
      </div>

      {erreur && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {erreur}
        </p>
      )}

      {showCreneaux && editable && (
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
                onChange={(e) =>
                  setFormCreneau({ ...formCreneau, libelle: e.target.value })
                }
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Type</label>
              <select
                value={formCreneau.type}
                onChange={(e) =>
                  setFormCreneau({
                    ...formCreneau,
                    type: e.target.value as TypeCreneau,
                  })
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
      )}

      <PeriodesVacances periodes={periodes} zone={zone} loading={loadingVacances} />

      {loadingVacances || periodeIndex === null ? (
        <p className="text-sm text-zinc-400">Chargement...</p>
      ) : periodes.length === 0 ? (
        <p className="text-sm text-zinc-400">Aucune période de vacances trouvée.</p>
      ) : (
        <>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
              Période
            </p>
            <select
              value={periodeIndex}
              onChange={(e) => setPeriodeIndex(Number(e.target.value))}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              {periodes.map((p, i) => (
                <option key={p.description + p.debut} value={i}>
                  {p.description} ({p.debut} – {p.fin})
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="text-sm text-zinc-400">Chargement...</p>
          ) : creneaux.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Aucun créneau défini. {editable && "Clique \"Gérer les créneaux\" pour en créer."}
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {GROUPES.map((groupe) => (
                <div key={groupe}>
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                    {GROUPE_LABELS[groupe]}
                  </h2>
                  <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
                    <table className="text-left text-sm">
                      <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                        <tr>
                          <th className="sticky left-0 z-10 bg-zinc-50 px-4 py-3 font-medium">
                            Créneau
                          </th>
                          {jours.map((j) => (
                            <th
                              key={j}
                              className={`px-2 py-3 text-center font-medium capitalize ${
                                estWeekend(j) ? "bg-zinc-100 text-zinc-400" : ""
                              }`}
                            >
                              {formatJourCourt(j)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {TYPES.map((type) => {
                          const lignes = creneaux.filter((c) => c.type === type);
                          if (lignes.length === 0) return null;
                          return (
                            <Fragment key={type}>
                              <tr className="bg-zinc-50/70">
                                <td
                                  colSpan={jours.length + 1}
                                  className="sticky left-0 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-400"
                                >
                                  {TYPE_CRENEAU_LABELS[type]}
                                </td>
                              </tr>
                              {lignes.map((c) => (
                                <tr key={c.id} className="border-b border-zinc-100 last:border-0">
                                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-2 font-medium text-zinc-900">
                                    {c.libelle}
                                  </td>
                                  {jours.map((j) => {
                                    if (estWeekend(j)) {
                                      return (
                                        <td key={j} className="bg-zinc-100 px-2 py-2 text-center" />
                                      );
                                    }
                                    const eligibles = animateursDuGroupe(groupe, j);
                                    const ids = animateursDe(c.id, j).filter((id) =>
                                      eligibles.includes(id)
                                    );
                                    const noms = ids
                                      .map((id) => animateurs.find((a) => a.id === id))
                                      .filter(Boolean)
                                      .map((a) => a!.prenom);
                                    return (
                                      <td
                                        key={j}
                                        onClick={() =>
                                          editable &&
                                          setCelluleOuverte({ creneauId: c.id, date: j, groupe })
                                        }
                                        className={`min-w-24 px-2 py-2 text-center text-xs text-zinc-700 ${
                                          editable ? "cursor-pointer hover:bg-zinc-50" : ""
                                        }`}
                                      >
                                        {noms.length > 0 ? noms.join(" / ") : editable ? "+" : ""}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {animateurs.length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-medium text-zinc-900">
                Total d&apos;heures sur la période
              </p>
              <div className="flex flex-wrap gap-2">
                {animateurs.map((a) => (
                  <span
                    key={a.id}
                    className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700"
                  >
                    {a.prenom} {a.nom} ·{" "}
                    <span className="font-semibold">
                      {formatHeures(heuresParAnimateur.get(a.id) ?? 0)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {celluleOuverte && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4"
          onClick={() => setCelluleOuverte(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-900">
                {GROUPE_LABELS[celluleOuverte.groupe]} ·{" "}
                {creneaux.find((c) => c.id === celluleOuverte.creneauId)?.libelle} ·{" "}
                {formatJourCourt(celluleOuverte.date)}
              </p>
              <button
                onClick={() => setCelluleOuverte(null)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                ✕
              </button>
            </div>
            {(() => {
              const eligibles = animateursDuGroupe(
                celluleOuverte.groupe,
                celluleOuverte.date
              );
              if (eligibles.length === 0) {
                return (
                  <p className="text-sm text-zinc-500">
                    Aucun animateur affecté au groupe {GROUPE_LABELS[celluleOuverte.groupe]}{" "}
                    ce jour-là. Commence par la page{" "}
                    <Link href="/dashboard/repartition" className="underline">
                      Répartition
                    </Link>
                    .
                  </p>
                );
              }
              return (
                <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                  {animateurs
                    .filter((a) => eligibles.includes(a.id))
                    .map((a) => {
                      const assigne = animateursDe(
                        celluleOuverte.creneauId,
                        celluleOuverte.date
                      ).includes(a.id);
                      return (
                        <label
                          key={a.id}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50"
                        >
                          <input
                            type="checkbox"
                            checked={assigne}
                            onChange={(e) =>
                              toggleAffectation(
                                celluleOuverte.creneauId,
                                celluleOuverte.date,
                                a.id,
                                e.target.checked
                              )
                            }
                          />
                          {a.prenom} {a.nom}
                        </label>
                      );
                    })}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
