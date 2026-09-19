"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { useVacances } from "@/lib/use-vacances";
import { estWeekend, joursDe, periodeEnCours, semainesDe } from "@/lib/vacances";
import { formatHeures, heuresJour, pauseMinutes, toMinutes } from "@/lib/creneaux";
import { PointageJour } from "@/components/pointage-jour";
import {
  canManage,
  type AffectationCreneau,
  type AffectationJour,
  type Animateur,
  type Creneau,
  type FeuilleTemps,
  type JourFermeture,
} from "@/lib/types";

// "18:00:00" -> "18h00" : l'heure elle-même plutôt que le libellé du
// créneau (ex. "Fermeture"), qui n'a pas sa place sur une fiche horaire.
function formatHeureCourte(heure: string) {
  return heure.slice(0, 5).replace(":", "h");
}

function formatPlage(creneaux: Creneau[]) {
  const arrivees = creneaux.filter((c) => c.type === "arrivee");
  const departs = creneaux.filter((c) => c.type === "depart");
  if (arrivees.length === 0 || departs.length === 0) return "—";
  const arrivee = arrivees.reduce((min, c) => (c.heure_debut < min.heure_debut ? c : min));
  const depart = departs.reduce((max, c) => (c.heure_debut > max.heure_debut ? c : max));
  return `${formatHeureCourte(arrivee.heure_debut)} → ${formatHeureCourte(depart.heure_debut)}`;
}

function formatPauses(creneaux: Creneau[]) {
  const pauses = creneaux.filter((c) => c.type === "pause");
  if (pauses.length === 0) return "—";
  return pauses.map((p) => p.libelle).join(", ");
}

/** Heures réellement présentes un jour donné : de l'arrivée réelle au
 * départ réel, moins la durée des pauses prévues ce jour-là (on ne
 * suit pas de pause "réelle" séparée). */
function presenceReelleJour(
  feuille: FeuilleTemps | undefined,
  assignesPrevus: Creneau[]
): number | null {
  if (!feuille || !feuille.present) return null;
  if (!feuille.heure_arrivee_reelle || !feuille.heure_depart_reelle) return null;
  const duree =
    toMinutes(feuille.heure_depart_reelle) - toMinutes(feuille.heure_arrivee_reelle);
  return Math.max(0, (duree - pauseMinutes(assignesPrevus)) / 60);
}

function formatJourCourt(dateISO: string) {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function FichesHorairesPage() {
  const profile = useProfile();
  const supabase = createClient();
  const editable = canManage(profile.role);
  const monGroupe = profile.role === "coordinateur" ? profile.groupe_coordinateur : null;
  const { periodes, zone, loading: loadingVacances } = useVacances();

  const [animateurs, setAnimateurs] = useState<Animateur[]>([]);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [affectations, setAffectations] = useState<AffectationCreneau[]>([]);
  const [affectationsJour, setAffectationsJour] = useState<AffectationJour[]>([]);
  const [feuilles, setFeuilles] = useState<FeuilleTemps[]>([]);
  const [joursFermeture, setJoursFermeture] = useState<JourFermeture[]>([]);
  const [periodeIndex, setPeriodeIndex] = useState<number | null>(null);
  const [semaineIndex, setSemaineIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [celluleOuverte, setCelluleOuverte] = useState<
    { animateurId: string; date: string } | null
  >(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    supabase
      .from("animateurs")
      .select("*")
      .eq("statut", "actif")
      .order("nom")
      .then(({ data }) => {
        if (data) setAnimateurs(data as Animateur[]);
      });
    supabase
      .from("creneaux")
      .select("*")
      .then(({ data }) => {
        if (data) setCreneaux(data as Creneau[]);
      });
    supabase
      .from("jours_fermeture")
      .select("*")
      .then(({ data }) => {
        if (data) setJoursFermeture(data as JourFermeture[]);
      });
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
  const joursFermesSet = useMemo(
    () => new Set(joursFermeture.map((f) => f.date)),
    [joursFermeture]
  );
  const joursOuvres = useMemo(
    () => jours.filter((j) => !estWeekend(j) && !joursFermesSet.has(j)),
    [jours, joursFermesSet]
  );
  const semaines = useMemo(() => semainesDe(joursOuvres), [joursOuvres]);
  const semaineIndexSafe = Math.min(semaineIndex, Math.max(0, semaines.length - 1));
  const semaineJours = useMemo(
    () => semaines[semaineIndexSafe] ?? [],
    [semaines, semaineIndexSafe]
  );

  async function chargerFeuilles(debut: string, fin: string) {
    const { data } = await supabase
      .from("feuilles_temps")
      .select("*")
      .gte("date", debut)
      .lte("date", fin);
    setFeuilles((data as FeuilleTemps[]) ?? []);
  }

  useEffect(() => {
    if (semaineJours.length === 0) return;
    const debut = semaineJours[0];
    const fin = semaineJours[semaineJours.length - 1];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    Promise.all([
      supabase.from("affectations_creneau").select("*").gte("date", debut).lte("date", fin),
      supabase.from("affectations_jour").select("*").gte("date", debut).lte("date", fin),
      supabase.from("feuilles_temps").select("*").gte("date", debut).lte("date", fin),
    ]).then(([{ data: c }, { data: j }, { data: f }]) => {
      setAffectations((c as AffectationCreneau[]) ?? []);
      setAffectationsJour((j as AffectationJour[]) ?? []);
      setFeuilles((f as FeuilleTemps[]) ?? []);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semaineJours]);

  function assignesDe(animateurId: string, date: string) {
    const ids = new Set(
      affectations
        .filter((a) => a.date === date && a.animateur_id === animateurId)
        .map((a) => a.creneau_id)
    );
    return creneaux.filter((c) => ids.has(c.id));
  }

  function aUneAffectation(animateurId: string, date: string) {
    return (
      affectations.some((a) => a.date === date && a.animateur_id === animateurId) ||
      affectationsJour.some((a) => a.date === date && a.animateur_id === animateurId)
    );
  }

  function groupeDe(animateurId: string, date: string) {
    return affectationsJour.find(
      (a) => a.date === date && a.animateur_id === animateurId
    )?.groupe;
  }

  // Une case n'est modifiable que si elle concerne le groupe géré par
  // le coordinateur (aucune restriction pour un directeur ou un
  // coordinateur non rattaché à un groupe).
  function modifiable(animateurId: string, date: string) {
    if (!editable) return false;
    if (!monGroupe) return true;
    return groupeDe(animateurId, date) === monGroupe;
  }

  const lignes = useMemo(
    () =>
      animateurs.filter((a) =>
        semaineJours.some(
          (j) => aUneAffectation(a.id, j) && (!monGroupe || groupeDe(a.id, j) === monGroupe)
        )
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [animateurs, semaineJours, affectations, affectationsJour, monGroupe]
  );

  async function majFeuille(
    animateurId: string,
    date: string,
    updates: Partial<
      Pick<
        FeuilleTemps,
        "present" | "motif_absence" | "heure_arrivee_reelle" | "heure_depart_reelle"
      >
    >
  ) {
    setErreur(null);
    const existante = feuilles.find((f) => f.date === date && f.animateur_id === animateurId);
    const payload = {
      present: existante?.present ?? true,
      motif_absence: existante?.motif_absence ?? null,
      heure_arrivee_reelle: existante?.heure_arrivee_reelle ?? null,
      heure_depart_reelle: existante?.heure_depart_reelle ?? null,
      ...updates,
    };

    setFeuilles((prev) => [
      ...prev.filter((f) => !(f.date === date && f.animateur_id === animateurId)),
      {
        id: existante?.id ?? `optimistic-${animateurId}-${date}`,
        date,
        animateur_id: animateurId,
        commentaire: existante?.commentaire ?? null,
        created_by: profile.id,
        created_at: existante?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...payload,
      },
    ]);

    const { error } = await supabase
      .from("feuilles_temps")
      .upsert(
        { date, animateur_id: animateurId, created_by: profile.id, ...payload },
        { onConflict: "date,animateur_id" }
      );
    if (error) {
      setErreur(error.message);
      const debut = semaineJours[0];
      const fin = semaineJours[semaineJours.length - 1];
      if (debut && fin) chargerFeuilles(debut, fin);
    }
  }

  async function supprimerFeuille(animateurId: string, date: string) {
    setErreur(null);
    setFeuilles((prev) =>
      prev.filter((f) => !(f.date === date && f.animateur_id === animateurId))
    );
    const { error } = await supabase
      .from("feuilles_temps")
      .delete()
      .eq("date", date)
      .eq("animateur_id", animateurId);
    if (error) {
      setErreur(error.message);
      const debut = semaineJours[0];
      const fin = semaineJours[semaineJours.length - 1];
      if (debut && fin) chargerFeuilles(debut, fin);
    }
  }

  function focusCellule(animateurId: string, date: string) {
    inputRefs.current[`${animateurId}|${date}`]?.focus();
  }

  function handleChange(
    animateurId: string,
    date: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const lettre = e.target.value.trim().toUpperCase().slice(-1);
    const joursActifs = semaineJours.filter((j) => aUneAffectation(animateurId, j));
    const indexCourant = joursActifs.indexOf(date);
    const prochain = joursActifs[indexCourant + 1];

    if (lettre === "I") {
      const assignes = assignesDe(animateurId, date);
      const arrivees = assignes.filter((c) => c.type === "arrivee");
      const departs = assignes.filter((c) => c.type === "depart");
      const arrivee =
        arrivees.length > 0
          ? arrivees.reduce((min, c) => (c.heure_debut < min.heure_debut ? c : min))
          : null;
      const depart =
        departs.length > 0
          ? departs.reduce((max, c) => (c.heure_debut > max.heure_debut ? c : max))
          : null;
      majFeuille(animateurId, date, {
        present: true,
        heure_arrivee_reelle: arrivee?.heure_debut ?? null,
        heure_depart_reelle: depart?.heure_debut ?? null,
        motif_absence: null,
      });
      if (prochain) focusCellule(animateurId, prochain);
    } else if (lettre === "A") {
      majFeuille(animateurId, date, { present: false });
      if (prochain) focusCellule(animateurId, prochain);
    }
  }

  function lettreEtCouleur(animateurId: string, date: string) {
    const feuille = feuilles.find((f) => f.date === date && f.animateur_id === animateurId);
    if (!feuille) return { lettre: "", couleur: "" };
    if (!feuille.present) return { lettre: "A", couleur: "bg-red-100 text-red-700" };

    const assignes = assignesDe(animateurId, date);
    const arrivees = assignes.filter((c) => c.type === "arrivee");
    const departs = assignes.filter((c) => c.type === "depart");
    const arriveePrevue =
      arrivees.length > 0
        ? arrivees.reduce((min, c) => (c.heure_debut < min.heure_debut ? c : min)).heure_debut
        : null;
    const departPrevu =
      departs.length > 0
        ? departs.reduce((max, c) => (c.heure_debut > max.heure_debut ? c : max)).heure_debut
        : null;

    const idem =
      feuille.heure_arrivee_reelle === arriveePrevue &&
      feuille.heure_depart_reelle === departPrevu;

    return idem
      ? { lettre: "I", couleur: "bg-emerald-100 text-emerald-700" }
      : { lettre: "R", couleur: "bg-amber-100 text-amber-700" };
  }

  function totauxSemaine(animateurId: string) {
    let ecart = 0;
    let presence = 0;
    let pause = 0;
    let complet = true;
    for (const j of semaineJours) {
      if (!aUneAffectation(animateurId, j)) continue;
      const assignes = assignesDe(animateurId, j);
      const prevu = heuresJour(assignes);
      const feuille = feuilles.find((f) => f.date === j && f.animateur_id === animateurId);
      if (!feuille || prevu === null) {
        complet = false;
        continue;
      }
      if (!feuille.present) continue;
      const reel = presenceReelleJour(feuille, assignes);
      if (reel !== null) {
        ecart += reel - prevu;
        presence += reel;
        pause += pauseMinutes(assignes) / 60;
      } else {
        complet = false;
      }
    }
    return { ecart, presence, pause, complet };
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Fiches horaires</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {editable
              ? "Tape I (idem au prévisionnel) ou A (absent) dans chaque case — ça avance automatiquement au jour suivant. Clique ✎ pour un horaire différent."
              : "Horaires prévisionnels vs réels et présence de chaque animateur."}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Télécharger en PDF (à faire signer)
        </button>
      </div>

      {erreur && (
        <p className="no-print rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {erreur}
        </p>
      )}

      {loadingVacances || periodeIndex === null ? (
        <p className="text-sm text-zinc-400">Chargement...</p>
      ) : periodes.length === 0 ? (
        <p className="text-sm text-zinc-400">Aucune période de vacances trouvée.</p>
      ) : (
        <>
          <div className="no-print flex flex-wrap items-end gap-3">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                Période · Zone {zone}
              </p>
              <select
                value={periodeIndex}
                onChange={(e) => {
                  setPeriodeIndex(Number(e.target.value));
                  setSemaineIndex(0);
                }}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              >
                {periodes.map((p, i) => (
                  <option key={p.description + p.debut} value={i}>
                    {p.description} ({p.debut} – {p.fin})
                  </option>
                ))}
              </select>
            </div>

            {semaines.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Semaine
                </p>
                <select
                  value={semaineIndexSafe}
                  onChange={(e) => setSemaineIndex(Number(e.target.value))}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                >
                  {semaines.map((s, i) => (
                    <option key={s[0]} value={i}>
                      Semaine {i + 1} ({formatJourCourt(s[0])} – {formatJourCourt(s[s.length - 1])})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-3 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-emerald-100" /> I = Idem
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-red-100" /> A = Absent
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-amber-100" /> R = Réel différent
              </span>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-zinc-400">Chargement...</p>
          ) : lignes.length === 0 ? (
            <p className="text-sm text-zinc-400">Aucune affectation cette semaine.</p>
          ) : (
            <div className="no-print overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 border border-zinc-300 bg-zinc-50 px-3 py-2 font-medium">
                      Animateur
                    </th>
                    {semaineJours.map((j) => (
                      <th
                        key={j}
                        className="border border-zinc-300 bg-zinc-50 px-2 py-2 text-center font-medium capitalize"
                      >
                        {formatJourCourt(j)}
                      </th>
                    ))}
                    <th className="border border-zinc-300 bg-zinc-50 px-3 py-2 text-center font-medium">
                      Total présence
                    </th>
                    <th className="border border-zinc-300 bg-zinc-50 px-3 py-2 text-center font-medium">
                      Total pause
                    </th>
                    <th className="border border-zinc-300 bg-zinc-50 px-3 py-2 text-center font-medium">
                      Écart semaine
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((a) => {
                    const { ecart, presence, pause, complet } = totauxSemaine(a.id);
                    return (
                      <tr key={a.id} className="border-b border-zinc-100 last:border-0">
                        <td className="sticky left-0 z-10 whitespace-nowrap border border-zinc-300 bg-white px-3 py-2 font-medium text-zinc-900">
                          {a.prenom} {a.nom}
                        </td>
                        {semaineJours.map((j) => {
                          if (
                            !aUneAffectation(a.id, j) ||
                            (monGroupe && groupeDe(a.id, j) !== monGroupe)
                          ) {
                            return (
                              <td key={j} className="border border-zinc-300 bg-zinc-100 px-2 py-2" />
                            );
                          }
                          const { lettre, couleur } = lettreEtCouleur(a.id, j);
                          const peutModifier = modifiable(a.id, j);
                          return (
                            <td key={j} className="border border-zinc-300 px-2 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  ref={(el) => {
                                    inputRefs.current[`${a.id}|${j}`] = el;
                                  }}
                                  value={lettre}
                                  disabled={!peutModifier}
                                  onChange={(e) => handleChange(a.id, j, e)}
                                  onFocus={(e) => e.target.select()}
                                  maxLength={1}
                                  className={`h-8 w-8 rounded-md border border-zinc-300 text-center text-sm font-semibold uppercase focus:border-zinc-500 focus:outline-none ${couleur}`}
                                />
                                {peutModifier && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCelluleOuverte({ animateurId: a.id, date: j })
                                    }
                                    title="Horaire différent / motif"
                                    className="text-xs text-zinc-400 hover:text-zinc-700"
                                  >
                                    ✎
                                  </button>
                                )}
                                {peutModifier && lettre && (
                                  <button
                                    type="button"
                                    onClick={() => supprimerFeuille(a.id, j)}
                                    title="Supprimer ce pointage"
                                    className="text-xs text-zinc-400 hover:text-red-600"
                                  >
                                    🗑
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td className="border border-zinc-300 px-3 py-2 text-center text-sm font-semibold text-zinc-900">
                          {formatHeures(presence)}
                        </td>
                        <td className="border border-zinc-300 px-3 py-2 text-center text-sm text-zinc-600">
                          {formatHeures(pause)}
                        </td>
                        <td className="border border-zinc-300 px-3 py-2 text-center">
                          {complet ? (
                            <span
                              className={`text-sm font-semibold ${
                                Math.abs(ecart) < 0.17
                                  ? "text-zinc-400"
                                  : ecart > 0
                                    ? "text-amber-600"
                                    : "text-red-600"
                              }`}
                            >
                              {ecart > 0 ? "+" : ""}
                              {formatHeures(ecart)}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-300">incomplet</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {lignes.length > 0 && (
            <div className="print-portrait hidden print:block">
              {lignes.map((a) => {
                return (
                  <div key={a.id} className="print-page">
                    <h2 className="text-lg font-bold text-zinc-900">Fiche horaire</h2>
                    <p className="mt-1 text-sm text-zinc-600">
                      {a.prenom} {a.nom} · Semaine du {formatJourCourt(semaineJours[0])} au{" "}
                      {formatJourCourt(semaineJours[semaineJours.length - 1])} · Zone {zone}
                    </p>

                    <table className="mt-4 w-full table-fixed border-collapse text-left text-sm">
                      <colgroup>
                        <col className="w-[15%]" />
                        <col className="w-[21.25%]" />
                        <col className="w-[21.25%]" />
                        <col className="w-[21.25%]" />
                        <col className="w-[21.25%]" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th
                            rowSpan={2}
                            className="border border-black bg-zinc-700 px-2 py-1.5 text-white"
                          />
                          <th
                            colSpan={2}
                            className="border border-black bg-zinc-700 px-2 py-1.5 text-center font-semibold text-white"
                          >
                            Prévisionnel
                          </th>
                          <th
                            colSpan={2}
                            className="border border-black bg-zinc-700 px-2 py-1.5 text-center font-semibold text-white"
                          >
                            Réel
                          </th>
                        </tr>
                        <tr>
                          <th className="border border-black bg-zinc-700 px-2 py-1.5 text-center font-medium text-white">
                            Présence
                          </th>
                          <th className="border border-black bg-zinc-700 px-2 py-1.5 text-center font-medium text-white">
                            Pause
                          </th>
                          <th className="border border-black bg-zinc-700 px-2 py-1.5 text-center font-medium text-white">
                            Présence
                          </th>
                          <th className="border border-black bg-zinc-700 px-2 py-1.5 text-center font-medium text-white">
                            Pause
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {semaineJours.map((j) => {
                          const assignes = assignesDe(a.id, j);
                          const feuille = feuilles.find(
                            (f) => f.date === j && f.animateur_id === a.id
                          );
                          const aAffectation = aUneAffectation(a.id, j);
                          const reelPresence = !feuille
                            ? ""
                            : !feuille.present
                              ? `Absent${feuille.motif_absence ? ` (${feuille.motif_absence})` : ""}`
                              : `${feuille.heure_arrivee_reelle?.slice(0, 5) ?? "—"} → ${feuille.heure_depart_reelle?.slice(0, 5) ?? "—"}`;
                          return (
                            <tr key={j}>
                              <td className="border border-black bg-zinc-200 px-2 py-2 capitalize">
                                {formatJourCourt(j)}
                              </td>
                              <td className="border border-black px-2 py-2">
                                {aAffectation ? formatPlage(assignes) : ""}
                              </td>
                              <td className="border border-black px-2 py-2">
                                {aAffectation ? formatPauses(assignes) : ""}
                              </td>
                              <td className="border border-black px-2 py-2">{reelPresence}</td>
                              <td className="border border-black px-2 py-2">
                                {aAffectation ? formatPauses(assignes) : ""}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div className="mt-8 grid grid-cols-2 gap-8">
                      <div className="border border-black px-3 py-2">
                        <p className="text-sm text-zinc-700">Signature de l&apos;employé</p>
                        <div className="h-14" />
                      </div>
                      <div className="border border-black px-3 py-2">
                        <p className="text-sm text-zinc-700">Signature de l&apos;employeur</p>
                        <div className="h-14" />
                      </div>
                    </div>

                    <table className="mt-8 w-full table-fixed border-collapse text-left text-sm">
                      <colgroup>
                        <col className="w-[15%]" />
                        <col className="w-[85%]" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="border border-black bg-zinc-700 px-2 py-1.5 text-center font-semibold text-white">
                            Jour
                          </th>
                          <th className="border border-black bg-zinc-700 px-2 py-1.5 text-center font-semibold text-white">
                            Présence (signature)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {semaineJours.map((j) => (
                          <tr key={j}>
                            <td className="border border-black bg-zinc-200 px-2 py-2 capitalize">
                              {formatJourCourt(j)}
                            </td>
                            <td className="border border-black px-2 py-2" />
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="mt-8 grid grid-cols-2 gap-8">
                      <div className="border border-black px-3 py-2">
                        <p className="text-sm text-zinc-700">Signature de l&apos;employé</p>
                        <div className="h-14" />
                      </div>
                      <div className="border border-black px-3 py-2">
                        <p className="text-sm text-zinc-700">Signature de l&apos;employeur</p>
                        <div className="h-14" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {celluleOuverte && (
        <div
          className="no-print fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4"
          onClick={() => setCelluleOuverte(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg"
          >
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-900">
                {animateurs.find((a) => a.id === celluleOuverte.animateurId)?.prenom}{" "}
                {animateurs.find((a) => a.id === celluleOuverte.animateurId)?.nom} ·{" "}
                {formatJourCourt(celluleOuverte.date)}
              </p>
              <button
                onClick={() => setCelluleOuverte(null)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                ✕
              </button>
            </div>
            <PointageJour
              feuille={
                feuilles.find(
                  (f) =>
                    f.date === celluleOuverte.date &&
                    f.animateur_id === celluleOuverte.animateurId
                ) ?? null
              }
              onChange={(updates) =>
                majFeuille(celluleOuverte.animateurId, celluleOuverte.date, updates)
              }
            />
            {feuilles.some(
              (f) =>
                f.date === celluleOuverte.date &&
                f.animateur_id === celluleOuverte.animateurId
            ) && (
              <button
                type="button"
                onClick={() => {
                  supprimerFeuille(celluleOuverte.animateurId, celluleOuverte.date);
                  setCelluleOuverte(null);
                }}
                className="mt-3 text-sm font-medium text-red-600 hover:text-red-700"
              >
                🗑 Supprimer ce pointage
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
