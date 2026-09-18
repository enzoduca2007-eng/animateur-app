"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { useVacances } from "@/lib/use-vacances";
import { estWeekend, joursDe, periodeEnCours, semainesDe } from "@/lib/vacances";
import { formatHeures, heuresJour } from "@/lib/creneaux";
import {
  canManage,
  GROUPE_LABELS,
  type AffectationCreneau,
  type AffectationJour,
  type Animateur,
  type Creneau,
  type FeuilleTemps,
  type JourFermeture,
} from "@/lib/types";

function formatJourCourt(dateISO: string) {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function formatPlage(creneaux: Creneau[]) {
  const arrivees = creneaux.filter((c) => c.type === "arrivee");
  const departs = creneaux.filter((c) => c.type === "depart");
  if (arrivees.length === 0 || departs.length === 0) return "—";
  const arrivee = arrivees.reduce((min, c) => (c.heure_debut < min.heure_debut ? c : min));
  const depart = departs.reduce((max, c) => (c.heure_debut > max.heure_debut ? c : max));
  return `${arrivee.libelle} → ${depart.libelle}`;
}

export default function FichesHorairesPage() {
  const profile = useProfile();
  const supabase = createClient();
  const editable = canManage(profile.role);
  const { periodes, zone, loading: loadingVacances } = useVacances();

  const [animateurs, setAnimateurs] = useState<Animateur[]>([]);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [affectations, setAffectations] = useState<AffectationCreneau[]>([]);
  const [affectationsJour, setAffectationsJour] = useState<AffectationJour[]>([]);
  const [joursFermeture, setJoursFermeture] = useState<JourFermeture[]>([]);
  const [feuilles, setFeuilles] = useState<FeuilleTemps[]>([]);
  const [periodeIndex, setPeriodeIndex] = useState<number | null>(null);
  const [semaineIndex, setSemaineIndex] = useState(0);
  const [animateurFiltre, setAnimateurFiltre] = useState<string>("tous");
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

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
  }, [semaineJours.join(",")]);

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
      chargerFeuilles(debut, fin);
    }
  }

  const lignes = useMemo(() => {
    const res: { animateur: Animateur; date: string }[] = [];
    for (const a of animateurs) {
      if (animateurFiltre !== "tous" && a.id !== animateurFiltre) continue;
      for (const j of semaineJours) {
        const aDesCreneaux = affectations.some(
          (aff) => aff.date === j && aff.animateur_id === a.id
        );
        const aUnGroupe = affectationsJour.some(
          (aff) => aff.date === j && aff.animateur_id === a.id
        );
        if (aDesCreneaux || aUnGroupe) res.push({ animateur: a, date: j });
      }
    }
    return res;
  }, [animateurs, animateurFiltre, semaineJours, affectations, affectationsJour]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Fiches horaires</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Horaires prévisionnels vs réels, et présence de chaque animateur.
        </p>
      </div>

      {erreur && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {erreur}
        </p>
      )}

      {loadingVacances || periodeIndex === null ? (
        <p className="text-sm text-zinc-400">Chargement...</p>
      ) : periodes.length === 0 ? (
        <p className="text-sm text-zinc-400">Aucune période de vacances trouvée.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
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

            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                Animateur
              </p>
              <select
                value={animateurFiltre}
                onChange={(e) => setAnimateurFiltre(e.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              >
                <option value="tous">Tous</option>
                {animateurs.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.prenom} {a.nom}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-zinc-400">Chargement...</p>
          ) : lignes.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Aucune affectation cette semaine{animateurFiltre !== "tous" ? " pour cet animateur" : ""}.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Animateur</th>
                    <th className="px-3 py-2 font-medium">Jour</th>
                    <th className="px-3 py-2 font-medium">Groupe</th>
                    <th className="px-3 py-2 font-medium">Prévisionnel</th>
                    <th className="px-3 py-2 font-medium">Présent</th>
                    <th className="px-3 py-2 font-medium">Réel</th>
                    <th className="px-3 py-2 font-medium">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map(({ animateur, date }) => {
                    const ids = new Set(
                      affectations
                        .filter((a) => a.date === date && a.animateur_id === animateur.id)
                        .map((a) => a.creneau_id)
                    );
                    const assignes = creneaux.filter((c) => ids.has(c.id));
                    const groupe = affectationsJour.find(
                      (a) => a.date === date && a.animateur_id === animateur.id
                    )?.groupe;
                    const heuresPrevues = heuresJour(assignes);
                    const feuille = feuilles.find(
                      (f) => f.date === date && f.animateur_id === animateur.id
                    );
                    const present = feuille?.present ?? true;

                    let heuresReelles: number | null = null;
                    if (
                      present &&
                      feuille?.heure_arrivee_reelle &&
                      feuille?.heure_depart_reelle
                    ) {
                      const [ha, ma] = feuille.heure_arrivee_reelle.split(":").map(Number);
                      const [hd, md] = feuille.heure_depart_reelle.split(":").map(Number);
                      heuresReelles = Math.max(0, (hd * 60 + md - (ha * 60 + ma)) / 60);
                    }

                    const ecart =
                      heuresPrevues !== null && heuresReelles !== null
                        ? heuresReelles - heuresPrevues
                        : null;

                    return (
                      <tr key={`${animateur.id}-${date}`} className="border-b border-zinc-100 last:border-0">
                        <td className="px-3 py-2 font-medium text-zinc-900">
                          {animateur.prenom} {animateur.nom}
                        </td>
                        <td className="px-3 py-2 capitalize text-zinc-600">
                          {formatJourCourt(date)}
                        </td>
                        <td className="px-3 py-2 text-zinc-600">
                          {groupe ? GROUPE_LABELS[groupe] : "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-600">
                          {formatPlage(assignes)}
                          {heuresPrevues !== null && (
                            <span className="ml-1 text-xs text-zinc-400">
                              ({formatHeures(heuresPrevues)})
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {editable ? (
                            <input
                              type="checkbox"
                              checked={present}
                              onChange={(e) =>
                                majFeuille(animateur.id, date, { present: e.target.checked })
                              }
                            />
                          ) : present ? (
                            "✅"
                          ) : (
                            "❌"
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {!present ? (
                            editable ? (
                              <input
                                type="text"
                                placeholder="Motif absence"
                                defaultValue={feuille?.motif_absence ?? ""}
                                onBlur={(e) =>
                                  majFeuille(animateur.id, date, {
                                    motif_absence: e.target.value || null,
                                  })
                                }
                                className="w-32 rounded-md border border-zinc-300 px-2 py-1 text-xs"
                              />
                            ) : (
                              <span className="text-xs text-zinc-500">
                                {feuille?.motif_absence ?? "Absent"}
                              </span>
                            )
                          ) : editable ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="time"
                                defaultValue={feuille?.heure_arrivee_reelle?.slice(0, 5) ?? ""}
                                onBlur={(e) =>
                                  majFeuille(animateur.id, date, {
                                    heure_arrivee_reelle: e.target.value || null,
                                  })
                                }
                                className="w-24 rounded-md border border-zinc-300 px-1 py-1 text-xs"
                              />
                              <span className="text-zinc-400">→</span>
                              <input
                                type="time"
                                defaultValue={feuille?.heure_depart_reelle?.slice(0, 5) ?? ""}
                                onBlur={(e) =>
                                  majFeuille(animateur.id, date, {
                                    heure_depart_reelle: e.target.value || null,
                                  })
                                }
                                className="w-24 rounded-md border border-zinc-300 px-1 py-1 text-xs"
                              />
                            </div>
                          ) : (
                            <span className="text-zinc-600">
                              {feuille?.heure_arrivee_reelle?.slice(0, 5) ?? "—"} →{" "}
                              {feuille?.heure_depart_reelle?.slice(0, 5) ?? "—"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {ecart !== null ? (
                            <span
                              className={`text-xs font-medium ${
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
                            <span className="text-xs text-zinc-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
