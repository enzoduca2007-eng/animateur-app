"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { useVacances } from "@/lib/use-vacances";
import { estWeekend, joursDe, periodeEnCours } from "@/lib/vacances";
import { formatHeures, heuresJour, toMinutes } from "@/lib/creneaux";
import { PeriodesVacances } from "@/components/periodes-vacances";
import {
  GROUPE_LABELS,
  type AffectationCreneau,
  type AffectationJour,
  type Animateur,
  type Creneau,
  type Groupe,
  type JourFermeture,
} from "@/lib/types";

const COULEUR_GROUPE: Record<Groupe, string> = {
  lutins: "bg-sky-100 text-sky-700",
  trolls: "bg-emerald-100 text-emerald-700",
  geants: "bg-amber-100 text-amber-700",
};

function formatJourLong(dateISO: string) {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function TimelineJour({ creneaux }: { creneaux: Creneau[] }) {
  const arrivees = creneaux.filter((c) => c.type === "arrivee");
  const departs = creneaux.filter((c) => c.type === "depart");
  const pauses = creneaux.filter((c) => c.type === "pause" && c.heure_fin);
  if (arrivees.length === 0 || departs.length === 0) return null;

  const debut = Math.min(...arrivees.map((c) => toMinutes(c.heure_debut)));
  const fin = Math.max(...departs.map((c) => toMinutes(c.heure_debut)));
  const span = Math.max(1, fin - debut);
  const arrivee = arrivees.reduce((min, c) =>
    toMinutes(c.heure_debut) < toMinutes(min.heure_debut) ? c : min
  );
  const depart = departs.reduce((max, c) =>
    toMinutes(c.heure_debut) > toMinutes(max.heure_debut) ? c : max
  );

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3 text-sm">
        <span className="flex items-center gap-1 font-medium text-emerald-700">
          🌅 {arrivee.libelle}
        </span>
        <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-emerald-100">
          {pauses.map((p) => {
            const pDebut = toMinutes(p.heure_debut);
            const pFin = toMinutes(p.heure_fin!);
            const left = ((pDebut - debut) / span) * 100;
            const largeur = ((pFin - pDebut) / span) * 100;
            return (
              <div
                key={p.id}
                className="absolute inset-y-0 bg-amber-300"
                style={{
                  left: `${Math.max(0, left)}%`,
                  width: `${Math.max(0, largeur)}%`,
                }}
              />
            );
          })}
        </div>
        <span className="flex items-center gap-1 font-medium text-indigo-700">
          🌇 {depart.libelle}
        </span>
      </div>
      {pauses.length > 0 && (
        <p className="mt-1 text-right text-xs text-amber-600">
          ☕ pause : {pauses.map((p) => p.libelle).join(", ")}
        </p>
      )}
    </div>
  );
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

  const joursTravailles = useMemo(
    () =>
      joursOuvres.filter(
        (j) =>
          affectations.some((a) => a.date === j) ||
          affectationsJour.some((a) => a.date === j)
      ),
    [joursOuvres, affectations, affectationsJour]
  );

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

  const aujourdhui = new Date().toISOString().slice(0, 10);

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
              <div className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-gradient-to-r from-zinc-900 to-zinc-700 p-5 text-white shadow-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-300">
                    Total sur la période
                  </p>
                  <p className="mt-1 text-3xl font-bold">{formatHeures(totalHeures)}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs uppercase tracking-wide text-zinc-300">
                    Jours travaillés
                  </p>
                  <p className="mt-1 text-3xl font-bold">{joursTravailles.length}</p>
                </div>
              </div>

              {joursTravailles.length === 0 ? (
                <p className="text-sm text-zinc-400">
                  Aucune affectation sur cette période pour l&apos;instant.
                </p>
              ) : (
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
                    const estAujourdhui = j === aujourdhui;

                    return (
                      <div
                        key={j}
                        className={`rounded-2xl border p-5 shadow-sm ${
                          estAujourdhui
                            ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900"
                            : "border-zinc-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            {estAujourdhui && (
                              <span className="mb-1 inline-block rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                Aujourd&apos;hui
                              </span>
                            )}
                            <p className="text-lg font-bold capitalize text-zinc-900">
                              {formatJourLong(j)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {groupe && (
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${COULEUR_GROUPE[groupe]}`}
                              >
                                {GROUPE_LABELS[groupe]}
                              </span>
                            )}
                            {heures !== null && (
                              <span className="rounded-full bg-zinc-900 px-3 py-1 text-sm font-bold text-white">
                                {formatHeures(heures)}
                              </span>
                            )}
                          </div>
                        </div>

                        {assignesJour.length > 0 ? (
                          <TimelineJour creneaux={assignesJour} />
                        ) : (
                          <p className="mt-3 text-xs text-zinc-400">
                            Affecté au groupe, pas encore d&apos;horaires précis.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
