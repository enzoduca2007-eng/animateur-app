"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import {
  AVIS_FINAL_LABELS,
  CRITERES_STAGIAIRE,
  NIVEAU_CRITERE_LABELS,
  canManage,
  type Animateur,
  type AvisFinal,
  type EvaluationStagiaire,
  type NiveauCritere,
} from "@/lib/types";

const COULEUR_AVIS: Record<AvisFinal, string> = {
  favorable: "bg-emerald-100 text-emerald-700",
  reserve: "bg-amber-100 text-amber-700",
  defavorable: "bg-red-100 text-red-700",
};

export default function StagiairesPage() {
  const profile = useProfile();
  const supabase = createClient();
  const editable = canManage(profile.role);

  const [stagiaires, setStagiaires] = useState<Animateur[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationStagiaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);

  async function charger() {
    setLoading(true);
    const [{ data: a }, { data: e }] = await Promise.all([
      supabase.from("animateurs").select("*").eq("est_stagiaire", true).order("nom"),
      supabase.from("evaluations_stagiaire").select("*"),
    ]);
    setStagiaires((a as Animateur[]) ?? []);
    setEvaluations((e as EvaluationStagiaire[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function evaluationDe(animateurId: string) {
    return evaluations.find((e) => e.animateur_id === animateurId);
  }

  async function majEvaluation(
    animateurId: string,
    updates: Partial<
      Pick<EvaluationStagiaire, "criteres" | "avis_final" | "appreciation_generale" | "axes_progres">
    >
  ) {
    setErreur(null);
    const existante = evaluationDe(animateurId);
    const payload = {
      criteres: existante?.criteres ?? {},
      avis_final: existante?.avis_final ?? null,
      appreciation_generale: existante?.appreciation_generale ?? null,
      axes_progres: existante?.axes_progres ?? null,
      ...updates,
    };

    setEvaluations((prev) => [
      ...prev.filter((e) => e.animateur_id !== animateurId),
      {
        id: existante?.id ?? `optimistic-${animateurId}`,
        animateur_id: animateurId,
        created_by: profile.id,
        created_at: existante?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...payload,
      },
    ]);

    const { error } = await supabase
      .from("evaluations_stagiaire")
      .upsert(
        { animateur_id: animateurId, created_by: profile.id, ...payload },
        { onConflict: "animateur_id" }
      );
    if (error) {
      setErreur(error.message);
      charger();
    }
  }

  function majCritere(animateurId: string, critere: string, niveau: NiveauCritere) {
    const existante = evaluationDe(animateurId);
    majEvaluation(animateurId, {
      criteres: { ...(existante?.criteres ?? {}), [critere]: niveau },
    });
  }

  if (!editable) {
    return (
      <p className="text-sm text-zinc-500">
        Cette page est réservée à la direction (directeur/coordinateur).
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Stagiaires</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Fiche d&apos;évaluation BAFA de chaque animateur marqué
            &laquo;&nbsp;stagiaire&nbsp;&raquo; (page Animateurs), en vue du
            bilan de stage pratique.
          </p>
        </div>
        {stagiaires.length > 0 && (
          <button
            onClick={() => window.print()}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Imprimer les fiches
          </button>
        )}
      </div>

      {erreur && (
        <p className="no-print rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {erreur}
        </p>
      )}

      {loading ? (
        <p className="no-print text-sm text-zinc-400">Chargement...</p>
      ) : stagiaires.length === 0 ? (
        <p className="no-print text-sm text-zinc-400">
          Aucun stagiaire pour l&apos;instant — marque un animateur comme
          &laquo;&nbsp;stagiaire&nbsp;&raquo; depuis la page Animateurs.
        </p>
      ) : (
        <div className="no-print flex flex-col gap-3">
          {stagiaires.map((s) => {
            const evaluation = evaluationDe(s.id);
            const estOuvert = ouvert === s.id;
            return (
              <div
                key={s.id}
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
              >
                <button
                  onClick={() => setOuvert(estOuvert ? null : s.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900">
                      {s.prenom} {s.nom}
                    </span>
                    {s.stagiaire_confiance && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                        Confiance
                      </span>
                    )}
                    {evaluation?.avis_final && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${COULEUR_AVIS[evaluation.avis_final]}`}
                      >
                        {AVIS_FINAL_LABELS[evaluation.avis_final]}
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-zinc-400">
                    {estOuvert ? "Réduire ▲" : "Ouvrir la fiche ▼"}
                  </span>
                </button>

                {estOuvert && (
                  <div className="flex flex-col gap-5 border-t border-zinc-100 px-4 py-4">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-sm">
                        <thead className="text-xs uppercase tracking-wide text-zinc-400">
                          <tr>
                            <th className="pb-2 pr-3 font-medium">Critère</th>
                            {(["a_travailler", "en_cours", "acquis"] as NiveauCritere[]).map(
                              (niveau) => (
                                <th key={niveau} className="pb-2 px-2 text-center font-medium">
                                  {NIVEAU_CRITERE_LABELS[niveau]}
                                </th>
                              )
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {CRITERES_STAGIAIRE.map((c) => (
                            <tr key={c.cle} className="border-t border-zinc-100">
                              <td className="py-2 pr-3 text-zinc-700">{c.label}</td>
                              {(["a_travailler", "en_cours", "acquis"] as NiveauCritere[]).map(
                                (niveau) => (
                                  <td key={niveau} className="py-2 px-2 text-center">
                                    <input
                                      type="radio"
                                      name={`${s.id}-${c.cle}`}
                                      checked={evaluation?.criteres?.[c.cle] === niveau}
                                      onChange={() => majCritere(s.id, c.cle, niveau)}
                                    />
                                  </td>
                                )
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Avis final
                      </p>
                      <select
                        value={evaluation?.avis_final ?? ""}
                        onChange={(e) =>
                          majEvaluation(s.id, {
                            avis_final: (e.target.value || null) as AvisFinal | null,
                          })
                        }
                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                      >
                        <option value="">— À définir —</option>
                        {(["favorable", "reserve", "defavorable"] as AvisFinal[]).map((av) => (
                          <option key={av} value={av}>
                            {AVIS_FINAL_LABELS[av]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Appréciation générale
                      </p>
                      <textarea
                        defaultValue={evaluation?.appreciation_generale ?? ""}
                        onBlur={(e) =>
                          majEvaluation(s.id, { appreciation_generale: e.target.value || null })
                        }
                        rows={3}
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Axes de progrès
                      </p>
                      <textarea
                        defaultValue={evaluation?.axes_progres ?? ""}
                        onBlur={(e) =>
                          majEvaluation(s.id, { axes_progres: e.target.value || null })
                        }
                        rows={3}
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Fiches imprimables : une par stagiaire. */}
      {stagiaires.length > 0 && (
        <div className="hidden print:block">
          {stagiaires.map((s) => {
            const evaluation = evaluationDe(s.id);
            return (
              <div key={s.id} className="print-page">
                <h2 className="text-lg font-bold text-zinc-900">
                  Fiche d&apos;évaluation BAFA — stage pratique
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  {s.prenom} {s.nom}
                  {s.stagiaire_confiance ? " · Autonomie de confiance" : ""}
                </p>

                <table className="mt-4 w-full border-collapse text-left text-sm">
                  <thead>
                    <tr>
                      <th className="border border-black px-2 py-1.5 font-semibold">Critère</th>
                      <th className="border border-black px-2 py-1.5 font-semibold">Niveau</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CRITERES_STAGIAIRE.map((c) => (
                      <tr key={c.cle}>
                        <td className="border border-black px-2 py-1.5">{c.label}</td>
                        <td className="border border-black px-2 py-1.5">
                          {evaluation?.criteres?.[c.cle]
                            ? NIVEAU_CRITERE_LABELS[evaluation.criteres[c.cle] as NiveauCritere]
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="mt-4 text-sm">
                  <span className="font-semibold">Avis final : </span>
                  {evaluation?.avis_final ? AVIS_FINAL_LABELS[evaluation.avis_final] : "—"}
                </p>

                <div className="mt-3">
                  <p className="text-sm font-semibold">Appréciation générale</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">
                    {evaluation?.appreciation_generale || "—"}
                  </p>
                </div>

                <div className="mt-3">
                  <p className="text-sm font-semibold">Axes de progrès</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">
                    {evaluation?.axes_progres || "—"}
                  </p>
                </div>

                <div className="mt-12 grid grid-cols-2 gap-8">
                  <div>
                    <p className="text-sm text-zinc-700">Signature du stagiaire</p>
                    <div className="mt-10 border-t border-black" />
                  </div>
                  <div>
                    <p className="text-sm text-zinc-700">
                      Signature du directeur / de la coordination
                    </p>
                    <div className="mt-10 border-t border-black" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
