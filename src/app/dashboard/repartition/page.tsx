"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { useVacances } from "@/lib/use-vacances";
import { joursDe, periodeEnCours } from "@/lib/vacances";
import {
  canManage,
  GROUPES,
  GROUPE_LABELS,
  type AffectationJour,
  type Animateur,
  type Groupe,
} from "@/lib/types";

function formatJour(dateISO: string) {
  return new Date(`${dateISO}T00:00:00`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function RepartitionPage() {
  const profile = useProfile();
  const supabase = createClient();
  const editable = canManage(profile.role);
  const { periodes, zone, loading: loadingVacances } = useVacances();

  const [animateurs, setAnimateurs] = useState<Animateur[]>([]);
  const [affectations, setAffectations] = useState<AffectationJour[]>([]);
  const [periodeIndex, setPeriodeIndex] = useState(0);
  const [jour, setJour] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  // Choisit la période en cours (ou la prochaine) dès que le calendrier des
  // vacances est chargé, et un jour par défaut à l'intérieur.
  useEffect(() => {
    if (loadingVacances || periodes.length === 0 || jour) return;
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const defaut = periodeEnCours(periodes, aujourdhui);
    const index = periodes.findIndex((p) => p === defaut);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPeriodeIndex(index >= 0 ? index : 0);
    const jours = joursDe(defaut ?? periodes[0]);
    setJour(jours.find((j) => j >= aujourdhui) ?? jours[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingVacances, periodes]);

  async function loadAffectations(date: string) {
    setLoading(true);
    const { data } = await supabase
      .from("affectations_jour")
      .select("*")
      .eq("date", date);
    setAffectations((data as AffectationJour[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (jour) loadAffectations(jour);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jour]);

  const joursDeLaPeriode = useMemo(
    () => (periodes[periodeIndex] ? joursDe(periodes[periodeIndex]) : []),
    [periodes, periodeIndex]
  );

  function groupeDe(animateurId: string): Groupe | null {
    return (
      affectations.find((a) => a.animateur_id === animateurId)?.groupe ?? null
    );
  }

  async function assigner(animateurId: string, groupe: Groupe) {
    if (!jour) return;
    const actuel = groupeDe(animateurId);

    if (actuel === groupe) {
      // Re-cliquer sur le même groupe désaffecte l'animateur du jour.
      setAffectations((prev) =>
        prev.filter((a) => a.animateur_id !== animateurId)
      );
      await supabase
        .from("affectations_jour")
        .delete()
        .eq("date", jour)
        .eq("animateur_id", animateurId);
      return;
    }

    setAffectations((prev) => [
      ...prev.filter((a) => a.animateur_id !== animateurId),
      {
        id: `optimistic-${animateurId}`,
        date: jour,
        animateur_id: animateurId,
        groupe,
        created_by: profile.id,
        created_at: new Date().toISOString(),
      },
    ]);

    await supabase
      .from("affectations_jour")
      .upsert(
        { date: jour, animateur_id: animateurId, groupe, created_by: profile.id },
        { onConflict: "date,animateur_id" }
      );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Répartition</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {editable
            ? "Affecte chaque animateur à un groupe pour la journée sélectionnée."
            : "Consulte la répartition des animateurs par groupe."}
        </p>
      </div>

      {loadingVacances ? (
        <p className="text-sm text-zinc-400">Chargement du calendrier des vacances...</p>
      ) : periodes.length === 0 ? (
        <p className="text-sm text-zinc-400">
          Aucune période de vacances à venir trouvée (zone {zone}).
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                Période de vacances · Zone {zone}
              </p>
              <select
                value={periodeIndex}
                onChange={(e) => {
                  const idx = Number(e.target.value);
                  setPeriodeIndex(idx);
                  setJour(joursDe(periodes[idx])[0]);
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

            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                Jour
              </p>
              <div className="flex flex-wrap gap-2">
                {joursDeLaPeriode.map((j) => (
                  <button
                    key={j}
                    onClick={() => setJour(j)}
                    className={`rounded-full border px-3 py-1 text-xs capitalize ${
                      jour === j
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-300 text-zinc-600 hover:border-zinc-400"
                    }`}
                  >
                    {formatJour(j)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {animateurs.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Aucun animateur actif. Ajoute-en depuis la page Animateurs.
            </p>
          ) : loading ? (
            <p className="text-sm text-zinc-400">Chargement...</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Animateur</th>
                    <th className="px-4 py-3 font-medium">Groupe</th>
                  </tr>
                </thead>
                <tbody>
                  {animateurs.map((a) => {
                    const actuel = groupeDe(a.id);
                    return (
                      <tr key={a.id} className="border-b border-zinc-100 last:border-0">
                        <td className="px-4 py-3 font-medium text-zinc-900">
                          {a.prenom} {a.nom}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {GROUPES.map((g) => (
                              <button
                                key={g}
                                disabled={!editable}
                                onClick={() => assigner(a.id, g)}
                                className={`rounded-full border px-3 py-1 text-xs ${
                                  actuel === g
                                    ? "border-zinc-900 bg-zinc-900 text-white"
                                    : "border-zinc-300 text-zinc-600"
                                } ${editable ? "hover:border-zinc-400" : "cursor-default opacity-70"}`}
                              >
                                {GROUPE_LABELS[g]}
                              </button>
                            ))}
                          </div>
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
