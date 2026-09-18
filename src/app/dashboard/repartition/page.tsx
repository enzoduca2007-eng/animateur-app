"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { useVacances } from "@/lib/use-vacances";
import { estWeekend, joursDe, periodeEnCours } from "@/lib/vacances";
import {
  canManage,
  type AffectationJour,
  type Animateur,
  type Groupe,
} from "@/lib/types";

const LETTRE_PAR_GROUPE: Record<Groupe, string> = {
  lutins: "L",
  trolls: "T",
  geants: "G",
};

const GROUPE_PAR_LETTRE: Record<string, Groupe> = {
  L: "lutins",
  T: "trolls",
  G: "geants",
};

const COULEUR_PAR_GROUPE: Record<Groupe, string> = {
  lutins: "bg-sky-100 text-sky-700",
  trolls: "bg-emerald-100 text-emerald-700",
  geants: "bg-amber-100 text-amber-700",
};

function formatJourCourt(dateISO: string) {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function RepartitionPage() {
  const profile = useProfile();
  const supabase = createClient();
  const editable = canManage(profile.role);
  const { periodes, zone, loading: loadingVacances } = useVacances();

  const [animateurs, setAnimateurs] = useState<Animateur[]>([]);
  const [affectations, setAffectations] = useState<AffectationJour[]>([]);
  const [periodeIndex, setPeriodeIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
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
  const joursOuvrables = useMemo(
    () => jours.filter((j) => !estWeekend(j)),
    [jours]
  );

  async function loadAffectations(debut: string, fin: string) {
    setLoading(true);
    const { data } = await supabase
      .from("affectations_jour")
      .select("*")
      .gte("date", debut)
      .lte("date", fin);
    setAffectations((data as AffectationJour[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (periode) loadAffectations(periode.debut, periode.fin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode]);

  const parCle = useMemo(() => {
    const map = new Map<string, Groupe>();
    for (const a of affectations) map.set(`${a.date}|${a.animateur_id}`, a.groupe);
    return map;
  }, [affectations]);

  function focusCellule(animateurId: string, date: string) {
    inputRefs.current[`${animateurId}|${date}`]?.focus();
  }

  async function assigner(animateurId: string, date: string, lettre: string) {
    const groupe = GROUPE_PAR_LETTRE[lettre] ?? null;
    const precedente = affectations.find(
      (a) => a.animateur_id === animateurId && a.date === date
    );

    setErreur(null);
    setAffectations((prev) => {
      const sansCelle = prev.filter(
        (a) => !(a.animateur_id === animateurId && a.date === date)
      );
      if (!groupe) return sansCelle;
      return [
        ...sansCelle,
        {
          id: `optimistic-${animateurId}-${date}`,
          date,
          animateur_id: animateurId,
          groupe,
          created_by: profile.id,
          created_at: new Date().toISOString(),
        },
      ];
    });

    function annulerOptimiste() {
      setAffectations((prev) => {
        const sansCelle = prev.filter(
          (a) => !(a.animateur_id === animateurId && a.date === date)
        );
        return precedente ? [...sansCelle, precedente] : sansCelle;
      });
    }

    if (!groupe) {
      const { error } = await supabase
        .from("affectations_jour")
        .delete()
        .eq("date", date)
        .eq("animateur_id", animateurId);
      if (error) {
        annulerOptimiste();
        setErreur(error.message);
      }
      return;
    }

    const { error } = await supabase
      .from("affectations_jour")
      .upsert(
        { date, animateur_id: animateurId, groupe, created_by: profile.id },
        { onConflict: "date,animateur_id" }
      );

    if (error) {
      annulerOptimiste();
      setErreur(error.message);
      return;
    }

    const indexCourant = joursOuvrables.indexOf(date);
    const prochain = joursOuvrables[indexCourant + 1];
    if (prochain) focusCellule(animateurId, prochain);
  }

  function handleChange(
    animateurId: string,
    date: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const lettre = e.target.value.trim().toUpperCase().slice(-1);
    if (lettre && !GROUPE_PAR_LETTRE[lettre]) return; // caractère invalide ignoré
    assigner(animateurId, date, lettre);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Répartition</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {editable
            ? "Tape L (Lutins), T (Trolls) ou G (Géants) dans chaque case — la saisie avance automatiquement au jour suivant."
            : "Consulte la répartition des animateurs par groupe."}
        </p>
      </div>

      {loadingVacances || periodeIndex === null ? (
        <p className="text-sm text-zinc-400">Chargement du calendrier des vacances...</p>
      ) : periodes.length === 0 ? (
        <p className="text-sm text-zinc-400">
          Aucune période de vacances à venir trouvée (zone {zone}).
        </p>
      ) : (
        <>
          {erreur && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {erreur}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                Période de vacances · Zone {zone}
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
            <div className="flex gap-3 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-sky-100" /> L = Lutins
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-emerald-100" /> T = Trolls
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-amber-100" /> G = Géants
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-zinc-200" /> Week-end (fermé)
              </span>
            </div>
          </div>

          {animateurs.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Aucun animateur actif. Ajoute-en depuis la page Animateurs.
            </p>
          ) : loading ? (
            <p className="text-sm text-zinc-400">Chargement...</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
              <table className="text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="sticky left-0 z-10 bg-zinc-50 px-4 py-3 font-medium">
                      Animateur
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
                  {animateurs.map((a) => (
                    <tr key={a.id} className="border-b border-zinc-100 last:border-0">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-2 font-medium text-zinc-900">
                        {a.prenom} {a.nom}
                      </td>
                      {jours.map((j) => {
                        if (estWeekend(j)) {
                          return (
                            <td key={j} className="bg-zinc-100 px-2 py-2 text-center" />
                          );
                        }
                        const groupe = parCle.get(`${j}|${a.id}`);
                        return (
                          <td key={j} className="px-2 py-2 text-center">
                            {editable ? (
                              <input
                                ref={(el) => {
                                  inputRefs.current[`${a.id}|${j}`] = el;
                                }}
                                value={groupe ? LETTRE_PAR_GROUPE[groupe] : ""}
                                onChange={(e) => handleChange(a.id, j, e)}
                                onFocus={(e) => e.target.select()}
                                maxLength={1}
                                className={`h-8 w-8 rounded-md border border-zinc-300 text-center text-sm font-semibold uppercase focus:border-zinc-500 focus:outline-none ${
                                  groupe ? COULEUR_PAR_GROUPE[groupe] : ""
                                }`}
                              />
                            ) : (
                              <span
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold ${
                                  groupe ? COULEUR_PAR_GROUPE[groupe] : "text-zinc-300"
                                }`}
                              >
                                {groupe ? LETTRE_PAR_GROUPE[groupe] : "—"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
