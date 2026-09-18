"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { useVacances } from "@/lib/use-vacances";
import { estWeekend, joursDe, periodeEnCours } from "@/lib/vacances";
import { formatHeures, heuresJour } from "@/lib/creneaux";
import { PeriodesVacances } from "@/components/periodes-vacances";
import {
  GROUPE_LABELS,
  TYPE_CRENEAU_LABELS,
  type AffectationCreneau,
  type AffectationJour,
  type Animateur,
  type Creneau,
  type JourFermeture,
  type TypeCreneau,
} from "@/lib/types";

const TYPES: TypeCreneau[] = ["arrivee", "pause", "depart"];

function formatJourLong(dateISO: string) {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default function MonPlanningPage() {
  const profile = useProfile();
  const supabase = createClient();
  const { periodes, zone, loading: loadingVacances } = useVacances();

  const [moi, setMoi] = useState<Animateur | null | undefined>(undefined);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [affectations, setAffectations] = useState<AffectationCreneau[]>([]);
  const [affectationsJour, setAffectationsJour] = useState<AffectationJour[]>([]);
  const [joursFermeture, setJoursFermeture] = useState<JourFermeture[]>([]);
  const [periodeIndex, setPeriodeIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("animateurs")
      .select("*")
      .eq("profile_id", profile.id)
      .maybeSingle()
      .then(({ data }) => {
        setMoi((data as Animateur) ?? null);
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

  useEffect(() => {
    if (!moi || !periode) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    Promise.all([
      supabase
        .from("affectations_creneau")
        .select("*")
        .eq("animateur_id", moi.id)
        .gte("date", periode.debut)
        .lte("date", periode.fin),
      supabase
        .from("affectations_jour")
        .select("*")
        .eq("animateur_id", moi.id)
        .gte("date", periode.debut)
        .lte("date", periode.fin),
    ]).then(([{ data: c }, { data: j }]) => {
      setAffectations((c as AffectationCreneau[]) ?? []);
      setAffectationsJour((j as AffectationJour[]) ?? []);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moi, periode]);

  const totalHeures = useMemo(() => {
    let total = 0;
    for (const j of joursOuvres) {
      const ids = new Set(
        affectations.filter((a) => a.date === j).map((a) => a.creneau_id)
      );
      const assignes = creneaux.filter((c) => ids.has(c.id));
      const h = heuresJour(assignes);
      if (h) total += h;
    }
    return total;
  }, [joursOuvres, affectations, creneaux]);

  if (moi === undefined) {
    return <p className="text-sm text-zinc-400">Chargement...</p>;
  }

  if (moi === null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-zinc-900">Mon planning</h1>
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Ton compte n&apos;est pas encore relié à une fiche animateur.
          Demande à un directeur ou un coordinateur de faire le lien depuis
          la page Animateurs (bouton &quot;Modifier&quot; sur ta fiche).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Mon planning</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {moi.prenom} {moi.nom}
        </p>
      </div>

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
          ) : (
            <>
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-sm text-zinc-500">Total d&apos;heures sur la période</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900">
                  {formatHeures(totalHeures)}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {joursOuvres.map((j) => {
                  const idsJour = new Set(
                    affectations.filter((a) => a.date === j).map((a) => a.creneau_id)
                  );
                  const assignesJour = creneaux
                    .filter((c) => idsJour.has(c.id))
                    .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));
                  const groupe = affectationsJour.find((a) => a.date === j)?.groupe;

                  if (assignesJour.length === 0 && !groupe) return null;

                  const heures = heuresJour(assignesJour);

                  return (
                    <div
                      key={j}
                      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium capitalize text-zinc-900">
                          {formatJourLong(j)}
                        </p>
                        <div className="flex items-center gap-2">
                          {groupe && (
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                              {GROUPE_LABELS[groupe]}
                            </span>
                          )}
                          {heures !== null && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              {formatHeures(heures)}
                            </span>
                          )}
                        </div>
                      </div>
                      {assignesJour.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {TYPES.map((type) =>
                            assignesJour
                              .filter((c) => c.type === type)
                              .map((c) => (
                                <span
                                  key={c.id}
                                  className="rounded-full bg-zinc-50 px-2 py-1 text-xs text-zinc-600"
                                >
                                  {TYPE_CRENEAU_LABELS[type]} · {c.libelle}
                                </span>
                              ))
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-zinc-400">
                          Affecté au groupe, pas encore d&apos;horaires précis.
                        </p>
                      )}
                    </div>
                  );
                })}
                {joursOuvres.every(
                  (j) =>
                    affectationsJour.find((a) => a.date === j) === undefined &&
                    !affectations.some((a) => a.date === j)
                ) && (
                  <p className="text-sm text-zinc-400">
                    Aucune affectation sur cette période pour l&apos;instant.
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
