"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import {
  AVIS_FINAL_LABELS,
  CRITERES_STAGIAIRE,
  NIVEAU_CRITERE_ABBREV,
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

const COULEUR_NIVEAU: Record<NiveauCritere, string> = {
  a_travailler: "border-red-300 bg-red-100 text-red-700",
  en_cours: "border-amber-300 bg-amber-100 text-amber-700",
  acquis: "border-emerald-300 bg-emerald-100 text-emerald-700",
};

const NIVEAUX: NiveauCritere[] = ["a_travailler", "en_cours", "acquis"];

// Grille imprimable à 3 colonnes (À travailler / En cours / Acquis), une
// case cochée par critère — même mise en page que la saisie à l'écran.
// criteres=null : grille entièrement vierge (auto-évaluation à remplir
// à la main par le stagiaire).
function GrilleCriteresPrint({
  criteres,
}: {
  criteres: Partial<Record<string, NiveauCritere>> | null;
}) {
  return (
    <table className="mt-2 w-full border-collapse text-left text-xs">
      <thead>
        <tr>
          <th className="border border-black px-2 py-1.5 font-semibold">Critère</th>
          {NIVEAUX.map((niveau) => (
            <th
              key={niveau}
              className="border border-black px-2 py-1.5 text-center font-semibold"
            >
              {NIVEAU_CRITERE_LABELS[niveau]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {CRITERES_STAGIAIRE.map((c) => (
          <tr key={c.cle}>
            <td className="border border-black px-2 py-1.5">{c.label}</td>
            {NIVEAUX.map((niveau) => (
              <td key={niveau} className="border border-black px-2 py-1.5 text-center">
                {criteres?.[c.cle] === niveau ? "X" : ""}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function StagiairesPage() {
  const profile = useProfile();
  const supabase = createClient();
  const editable = canManage(profile.role);

  const [stagiaires, setStagiaires] = useState<Animateur[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationStagiaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  // null = imprime toutes les fiches ; un id = imprime seulement celle de ce
  // stagiaire (le bouton imprimante à côté de son nom).
  const [impressionCiblee, setImpressionCiblee] = useState<string | null>(null);

  function imprimer(animateurId: string | null) {
    setImpressionCiblee(animateurId);
    // Laisse React re-rendre la vue imprimable filtrée avant d'ouvrir le
    // dialogue d'impression.
    requestAnimationFrame(() => window.print());
  }

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
            onClick={() => imprimer(null)}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Imprimer toutes les fiches
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
                <div className="flex w-full items-center justify-between gap-3 px-4 py-3">
                  <button
                    onClick={() => setOuvert(estOuvert ? null : s.id)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
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
                  </button>
                  <button
                    onClick={() => imprimer(s.id)}
                    title="Imprimer seulement cette fiche"
                    className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                  >
                    🖨️
                  </button>
                  <button
                    onClick={() => setOuvert(estOuvert ? null : s.id)}
                    className="shrink-0 text-sm text-zinc-400"
                  >
                    {estOuvert ? "Réduire ▲" : "Ouvrir ▼"}
                  </button>
                </div>

                {estOuvert && (
                  <div className="flex flex-col gap-5 border-t border-zinc-100 px-4 py-4">
                    <div className="flex flex-col divide-y divide-zinc-100">
                      {CRITERES_STAGIAIRE.map((c) => {
                        const niveauActuel = evaluation?.criteres?.[c.cle];
                        return (
                          <div
                            key={c.cle}
                            className="flex items-center justify-between gap-3 py-2"
                          >
                            <span className="text-sm text-zinc-700">{c.label}</span>
                            <div className="flex shrink-0 gap-1">
                              {NIVEAUX.map((niveau) => (
                                <button
                                  key={niveau}
                                  type="button"
                                  title={NIVEAU_CRITERE_LABELS[niveau]}
                                  onClick={() => majCritere(s.id, c.cle, niveau)}
                                  className={`h-7 w-11 rounded-md border text-xs font-semibold ${
                                    niveauActuel === niveau
                                      ? COULEUR_NIVEAU[niveau]
                                      : "border-zinc-300 bg-white text-zinc-400 hover:bg-zinc-50"
                                  }`}
                                >
                                  {NIVEAU_CRITERE_ABBREV[niveau]}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
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

      {/* Fiches imprimables : une par stagiaire, ou une seule si le bouton
          imprimante d'une fiche précise a été utilisé. */}
      {stagiaires.length > 0 && (
        <div className="hidden print:block">
          {stagiaires
            .filter((s) => !impressionCiblee || s.id === impressionCiblee)
            .map((s) => {
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

                <p className="mt-3 text-sm font-semibold text-zinc-900">
                  Évaluation par la direction
                </p>
                <GrilleCriteresPrint criteres={evaluation?.criteres ?? null} />

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

                {/* Grille vierge, à remplir à la main par le stagiaire
                    lui-même — sur sa propre page pour ne pas se mélanger
                    avec l'évaluation de la direction. */}
                <div className="print:break-before-page">
                  <h2 className="text-lg font-bold text-zinc-900">
                    Auto-évaluation du stagiaire
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600">
                    {s.prenom} {s.nom} — à remplir par le stagiaire lui-même
                  </p>
                  <GrilleCriteresPrint criteres={null} />

                  <div className="mt-3">
                    <p className="text-sm font-semibold">Commentaires du stagiaire</p>
                    <div className="mt-2 h-24 border border-black" />
                  </div>

                  <div className="mt-12 grid grid-cols-2 gap-8">
                    <div>
                      <p className="text-sm text-zinc-700">Date</p>
                      <div className="mt-10 border-t border-black" />
                    </div>
                    <div>
                      <p className="text-sm text-zinc-700">Signature du stagiaire</p>
                      <div className="mt-10 border-t border-black" />
                    </div>
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
