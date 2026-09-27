"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { useVacances } from "@/lib/use-vacances";
import { periodeEnCours } from "@/lib/vacances";
import { PeriodesVacances } from "@/components/periodes-vacances";
import {
  type Animateur,
  type FicheAnimation,
  type Groupe,
  type PlanningActivite,
  type SousGroupe,
} from "@/lib/types";

function labelBloc(groupe: Groupe, sousGroupe: SousGroupe | null) {
  if (groupe === "lutins") return "Lutins";
  return sousGroupe === "geants" ? "Géants" : "Trolls";
}

function formatDateLongue(dateISO: string) {
  return new Date(`${dateISO}T00:00:00Z`)
    .toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    })
    .replace(/^\w/, (c) => c.toUpperCase());
}

export default function FichesAnimationPage() {
  const profile = useProfile();
  const supabase = createClient();
  const { periodes, zone, loading: loadingVacances } = useVacances();

  const monGroupe = profile.role === "coordinateur" ? profile.groupe_coordinateur : null;

  function peutGererGroupe(groupe: Groupe) {
    if (profile.role === "directeur" || profile.role === "responsable") return true;
    if (profile.role !== "coordinateur") return false;
    return !monGroupe || monGroupe === groupe;
  }

  const [periodeIndex, setPeriodeIndex] = useState<number | null>(null);
  const [animateurs, setAnimateurs] = useState<Animateur[]>([]);
  const [activites, setActivites] = useState<PlanningActivite[]>([]);
  const [fiches, setFiches] = useState<FicheAnimation[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (loadingVacances || periodes.length === 0 || periodeIndex !== null) return;
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const defaut = periodeEnCours(periodes, aujourdhui);
    const index = periodes.findIndex((p) => p === defaut);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPeriodeIndex(index >= 0 ? index : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingVacances, periodes]);

  const periode = periodeIndex !== null ? periodes[periodeIndex] : null;

  useEffect(() => {
    if (!periode) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    supabase
      .from("animateurs")
      .select("*")
      .eq("statut", "actif")
      .order("nom")
      .then(({ data }) => setAnimateurs((data as Animateur[]) ?? []));
    supabase
      .from("planning_activites")
      .select("*")
      .eq("type_activite", "grand_jeu")
      .gte("date", periode.debut)
      .lte("date", periode.fin)
      .order("date")
      .order("ordre")
      .then(async ({ data }) => {
        const acts = (data as PlanningActivite[]) ?? [];
        setActivites(acts);
        if (acts.length === 0) {
          setFiches([]);
          setLoading(false);
          return;
        }
        const { data: f } = await supabase
          .from("fiches_animation")
          .select("*")
          .in(
            "planning_activite_id",
            acts.map((a) => a.id)
          );
        setFiches((f as FicheAnimation[]) ?? []);
        setLoading(false);
      });
  }, [periode, supabase]);

  function ficheDe(activiteId: string) {
    return fiches.find((f) => f.planning_activite_id === activiteId);
  }

  function nomsDe(ids: string[]) {
    return ids
      .map((id) => animateurs.find((a) => a.id === id))
      .filter((a): a is Animateur => !!a)
      .map((a) => a.prenom);
  }

  async function majFicheAnimation(
    activiteId: string,
    updates: Partial<
      Pick<
        FicheAnimation,
        | "age"
        | "effectif"
        | "lieu"
        | "objectifs"
        | "sensibilisation"
        | "deroulement"
        | "conclusion_rangement"
        | "animateurs_requis"
      >
    >
  ) {
    const existante = ficheDe(activiteId);
    const payload = {
      age: existante?.age ?? null,
      effectif: existante?.effectif ?? null,
      lieu: existante?.lieu ?? null,
      objectifs: existante?.objectifs ?? null,
      sensibilisation: existante?.sensibilisation ?? null,
      deroulement: existante?.deroulement ?? null,
      conclusion_rangement: existante?.conclusion_rangement ?? null,
      animateurs_requis: existante?.animateurs_requis ?? null,
      ...updates,
    };

    setFiches((prev) => [
      ...prev.filter((f) => f.planning_activite_id !== activiteId),
      {
        id: existante?.id ?? `optimistic-${activiteId}`,
        planning_activite_id: activiteId,
        created_by: profile.id,
        created_at: existante?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...payload,
      },
    ]);

    const { error } = await supabase
      .from("fiches_animation")
      .upsert(
        { planning_activite_id: activiteId, created_by: profile.id, ...payload },
        { onConflict: "planning_activite_id" }
      );
    if (error) setErreur(error.message);
  }

  async function majActivite(activiteId: string, updates: { duree?: string | null; materiel?: string | null }) {
    setActivites((prev) =>
      prev.map((a) => (a.id === activiteId ? { ...a, ...updates } : a))
    );
    await supabase.from("planning_activites").update(updates).eq("id", activiteId);
  }

  const activitesTriees = useMemo(
    () => [...activites].sort((a, b) => (a.date === b.date ? a.ordre - b.ordre : a.date.localeCompare(b.date))),
    [activites]
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print">
        <h1 className="text-2xl font-semibold text-zinc-900">Fiches d&apos;animation</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Toutes les fiches des grands jeux programmés sur la période, prêtes à compléter
          et à imprimer.
        </p>
      </div>

      <div className="no-print">
        <PeriodesVacances periodes={periodes} zone={zone} loading={loadingVacances} />
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
          <div className="no-print flex flex-wrap items-end gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
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
            {activitesTriees.length > 0 && (
              <button
                onClick={() => window.print()}
                className="ml-auto rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Imprimer toutes les fiches
              </button>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-zinc-400">Chargement...</p>
          ) : activitesTriees.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Aucun grand jeu programmé sur cette période.
            </p>
          ) : (
            <div className="no-print flex flex-col gap-4">
              {activitesTriees.map((act) => {
                const fiche = ficheDe(act.id);
                const modifiable = peutGererGroupe(act.groupe);
                return (
                  <div
                    key={act.id}
                    className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                          {formatDateLongue(act.date)} · {labelBloc(act.groupe, act.sous_groupe)}
                        </p>
                        <p className="text-base font-semibold text-zinc-900">
                          🏆 {act.libelle}
                        </p>
                      </div>
                      {act.animateur_ids.length > 0 && (
                        <p className="text-xs font-semibold text-emerald-700">
                          → {nomsDe(act.animateur_ids).join(", ")}
                        </p>
                      )}
                    </div>

                    <fieldset disabled={!modifiable} className="flex flex-col gap-3 disabled:opacity-60">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div>
                          <label className="mb-1 block text-xs text-zinc-500">Âge</label>
                          <input
                            defaultValue={fiche?.age ?? ""}
                            placeholder="ex. 6-8 ans"
                            onBlur={(e) => majFicheAnimation(act.id, { age: e.target.value || null })}
                            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-zinc-500">Effectif</label>
                          <input
                            defaultValue={fiche?.effectif ?? ""}
                            placeholder="ex. 25"
                            onBlur={(e) =>
                              majFicheAnimation(act.id, { effectif: e.target.value || null })
                            }
                            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-zinc-500">Lieu</label>
                          <input
                            defaultValue={fiche?.lieu ?? ""}
                            placeholder="ex. Extérieur"
                            onBlur={(e) => majFicheAnimation(act.id, { lieu: e.target.value || null })}
                            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-zinc-500">Durée</label>
                          <input
                            defaultValue={act.duree ?? ""}
                            placeholder="ex. 1h30"
                            onBlur={(e) => majActivite(act.id, { duree: e.target.value || null })}
                            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-zinc-500">Objectifs</label>
                        <textarea
                          defaultValue={fiche?.objectifs ?? ""}
                          onBlur={(e) =>
                            majFicheAnimation(act.id, { objectifs: e.target.value || null })
                          }
                          rows={2}
                          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-zinc-500">
                          Matériel nécessaire
                        </label>
                        <textarea
                          defaultValue={act.materiel ?? ""}
                          onBlur={(e) => majActivite(act.id, { materiel: e.target.value || null })}
                          rows={2}
                          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-zinc-500">
                          Sensibilisation / Aménagement
                        </label>
                        <textarea
                          defaultValue={fiche?.sensibilisation ?? ""}
                          onBlur={(e) =>
                            majFicheAnimation(act.id, { sensibilisation: e.target.value || null })
                          }
                          rows={2}
                          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-zinc-500">Déroulement</label>
                        <textarea
                          defaultValue={fiche?.deroulement ?? ""}
                          onBlur={(e) =>
                            majFicheAnimation(act.id, { deroulement: e.target.value || null })
                          }
                          rows={5}
                          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs text-zinc-500">
                            Conclusion / Rangement
                          </label>
                          <textarea
                            defaultValue={fiche?.conclusion_rangement ?? ""}
                            onBlur={(e) =>
                              majFicheAnimation(act.id, {
                                conclusion_rangement: e.target.value || null,
                              })
                            }
                            rows={2}
                            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-zinc-500">
                            Animateurs requis
                          </label>
                          <textarea
                            defaultValue={fiche?.animateurs_requis ?? ""}
                            placeholder="ex. 1 animateur arbitre, 1 animateur par équipe"
                            onBlur={(e) =>
                              majFicheAnimation(act.id, {
                                animateurs_requis: e.target.value || null,
                              })
                            }
                            rows={2}
                            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                          />
                        </div>
                      </div>
                    </fieldset>
                  </div>
                );
              })}
            </div>
          )}

          {/* Version imprimable : une fiche par page, au format du modèle
              papier (cases titrées grisées), une par activité de la période. */}
          <div className="hidden print:block">
            {activitesTriees.map((act) => {
              const fiche = ficheDe(act.id);
              return (
                <div key={act.id} className="print-page print-portrait">
                  <div className="border border-black">
                    <p className="border-b border-black bg-zinc-200 px-2 py-1 text-xs font-semibold">
                      Nom de l&apos;activité
                    </p>
                    <p className="px-3 py-3 text-xl font-bold">{act.libelle}</p>
                  </div>

                  <div className="mt-3 grid grid-cols-4 border border-black">
                    {(
                      [
                        ["Âge", fiche?.age],
                        ["Effectif", fiche?.effectif],
                        ["Lieu", fiche?.lieu],
                        ["Durée", act.duree],
                      ] as [string, string | null | undefined][]
                    ).map(([label, valeur], idx) => (
                      <div key={label} className={idx > 0 ? "border-l border-black" : ""}>
                        <p className="border-b border-black bg-zinc-200 px-2 py-1 text-center text-xs font-semibold">
                          {label}
                        </p>
                        <p className="px-2 py-3 text-center text-sm">{valeur || "—"}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-2 border border-black">
                    <div>
                      <p className="border-b border-black bg-zinc-200 px-2 py-1 text-center text-xs font-semibold">
                        Objectifs
                      </p>
                      <p className="whitespace-pre-wrap px-3 py-3 text-sm">
                        {fiche?.objectifs || "—"}
                      </p>
                    </div>
                    <div className="border-l border-black">
                      <p className="border-b border-black bg-zinc-200 px-2 py-1 text-center text-xs font-semibold">
                        Matériel nécessaire
                      </p>
                      <p className="whitespace-pre-wrap px-3 py-3 text-sm">
                        {act.materiel || "—"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 border border-black">
                    <p className="border-b border-black bg-zinc-200 px-2 py-1 text-center text-xs font-semibold">
                      Sensibilisation / Aménagement
                    </p>
                    <p className="whitespace-pre-wrap px-3 py-3 text-sm">
                      {fiche?.sensibilisation || "—"}
                    </p>
                  </div>

                  <div className="mt-3 border border-black">
                    <p className="border-b border-black bg-zinc-200 px-2 py-1 text-center text-xs font-semibold">
                      Déroulement
                    </p>
                    <p className="min-h-32 whitespace-pre-wrap px-3 py-3 text-sm">
                      {fiche?.deroulement || "—"}
                    </p>
                  </div>

                  <div className="mt-3 grid grid-cols-2 border border-black">
                    <div>
                      <p className="border-b border-black bg-zinc-200 px-2 py-1 text-center text-xs font-semibold">
                        Conclusion / Rangement
                      </p>
                      <p className="whitespace-pre-wrap px-3 py-3 text-sm">
                        {fiche?.conclusion_rangement || "—"}
                      </p>
                    </div>
                    <div className="border-l border-black">
                      <p className="border-b border-black bg-zinc-200 px-2 py-1 text-center text-xs font-semibold">
                        Animateurs requis
                      </p>
                      <p className="whitespace-pre-wrap px-3 py-3 text-sm">
                        {fiche?.animateurs_requis || "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
