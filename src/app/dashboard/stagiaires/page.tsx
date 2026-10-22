"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { imprimer as lancerImpression } from "@/lib/impression";
import { useProfile } from "@/lib/profile-context";
import { GrilleCriteresPrint, NIVEAUX, concordance } from "@/components/grille-criteres-print";
import {
  AVIS_FINAL_LABELS,
  CRITERES_STAGIAIRE,
  NIVEAU_CRITERE_ABBREV,
  NIVEAU_CRITERE_LABELS,
  canManage,
  type Animateur,
  type AutoEvaluationStagiaire,
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
  depasse: "border-indigo-300 bg-indigo-100 text-indigo-700",
};

export default function StagiairesPage() {
  const profile = useProfile();
  const supabase = createClient();
  const editable = canManage(profile.role);

  const [stagiaires, setStagiaires] = useState<Animateur[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationStagiaire[]>([]);
  const [autoEvaluations, setAutoEvaluations] = useState<AutoEvaluationStagiaire[]>([]);
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
    requestAnimationFrame(() => lancerImpression());
  }

  async function charger() {
    setLoading(true);
    const [{ data: a }, { data: e }, { data: ae }] = await Promise.all([
      supabase.from("animateurs").select("*").eq("est_stagiaire", true).order("nom"),
      supabase.from("evaluations_stagiaire").select("*"),
      supabase.from("auto_evaluations_stagiaire").select("*"),
    ]);
    setStagiaires((a as Animateur[]) ?? []);
    setEvaluations((e as EvaluationStagiaire[]) ?? []);
    setAutoEvaluations((ae as AutoEvaluationStagiaire[]) ?? []);
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

  function autoEvaluationDe(animateurId: string) {
    return autoEvaluations.find((e) => e.animateur_id === animateurId);
  }

  async function majEvaluation(
    animateurId: string,
    updates: Partial<
      Pick<
        EvaluationStagiaire,
        | "criteres"
        | "appreciations_categories"
        | "avis_final"
        | "appreciation_generale"
        | "axes_progres"
      >
    >
  ) {
    if (evaluationDe(animateurId)?.verrouille) {
      setErreur("Cette fiche est verrouillée. Déverrouille-la avant de continuer.");
      return;
    }
    setErreur(null);
    const existante = evaluationDe(animateurId);
    const payload = {
      criteres: existante?.criteres ?? {},
      appreciations_categories: existante?.appreciations_categories ?? {},
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
        verrouille: existante?.verrouille ?? false,
        verrouille_par: existante?.verrouille_par ?? null,
        verrouille_at: existante?.verrouille_at ?? null,
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

  function majAppreciationCategorie(animateurId: string, categorieCle: string, texte: string) {
    const existante = evaluationDe(animateurId);
    majEvaluation(animateurId, {
      appreciations_categories: { ...(existante?.appreciations_categories ?? {}), [categorieCle]: texte },
    });
  }

  async function verrouillerStagiaire(animateurId: string, verrouille: boolean) {
    setErreur(null);
    const existante = evaluationDe(animateurId);
    const payload = {
      criteres: existante?.criteres ?? {},
      appreciations_categories: existante?.appreciations_categories ?? {},
      avis_final: existante?.avis_final ?? null,
      appreciation_generale: existante?.appreciation_generale ?? null,
      axes_progres: existante?.axes_progres ?? null,
      verrouille,
      verrouille_par: verrouille ? profile.id : null,
      verrouille_at: verrouille ? new Date().toISOString() : null,
    };

    setEvaluations((prev) => [
      ...prev.filter((e) => e.animateur_id !== animateurId),
      {
        id: existante?.id ?? `optimistic-${animateurId}`,
        animateur_id: animateurId,
        created_by: existante?.created_by ?? profile.id,
        created_at: existante?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...payload,
      },
    ]);

    const { error } = await supabase
      .from("evaluations_stagiaire")
      .upsert(
        { animateur_id: animateurId, created_by: existante?.created_by ?? profile.id, ...payload },
        { onConflict: "animateur_id" }
      );
    if (error) {
      setErreur(error.message);
      charger();
    }
  }

  async function supprimerEvaluation(animateurId: string, nomComplet: string) {
    if (
      !confirm(
        `Supprimer toute la fiche d'évaluation de ${nomComplet} (critères, appréciations, avis final) ? Cette action est irréversible.`
      )
    )
      return;
    setErreur(null);
    setEvaluations((prev) => prev.filter((e) => e.animateur_id !== animateurId));
    const { error } = await supabase
      .from("evaluations_stagiaire")
      .delete()
      .eq("animateur_id", animateurId);
    if (error) {
      setErreur(error.message);
      charger();
    }
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
            const autoEvaluation = autoEvaluationDe(s.id);
            const concordanceStagiaire = concordance(evaluation?.criteres, autoEvaluation?.criteres);
            const estOuvert = ouvert === s.id;
            const verrouillee = evaluation?.verrouille ?? false;
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
                    {autoEvaluation && Object.keys(autoEvaluation.criteres).length > 0 && (
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-600">
                        Auto-éval reçue
                      </span>
                    )}
                    {concordanceStagiaire.niveau && (
                      <span
                        title={`Concordance : ${concordanceStagiaire.matches}/${concordanceStagiaire.total} critères en commun avec le même niveau`}
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${COULEUR_NIVEAU[concordanceStagiaire.niveau]}`}
                      >
                        Concordance {NIVEAU_CRITERE_ABBREV[concordanceStagiaire.niveau]}
                      </span>
                    )}
                    {verrouillee && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        🔒 Verrouillée
                      </span>
                    )}
                  </button>
                  {profile.role === "directeur" && (
                    <button
                      onClick={() => verrouillerStagiaire(s.id, !verrouillee)}
                      title={verrouillee ? "Déverrouiller cette fiche" : "Verrouiller cette fiche"}
                      className={`shrink-0 rounded-md p-1.5 hover:bg-zinc-100 ${
                        verrouillee ? "text-emerald-600" : "text-zinc-400 hover:text-zinc-700"
                      }`}
                    >
                      {verrouillee ? "🔓" : "🔒"}
                    </button>
                  )}
                  <button
                    onClick={() => imprimer(s.id)}
                    title="Imprimer seulement cette fiche"
                    className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                  >
                    🖨️
                  </button>
                  {!verrouillee && (
                    <button
                      onClick={() => supprimerEvaluation(s.id, `${s.prenom} ${s.nom}`)}
                      title="Supprimer la fiche d'évaluation"
                      className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                    >
                      🗑
                    </button>
                  )}
                  <button
                    onClick={() => setOuvert(estOuvert ? null : s.id)}
                    className="shrink-0 text-sm text-zinc-400"
                  >
                    {estOuvert ? "Réduire ▲" : "Ouvrir ▼"}
                  </button>
                </div>

                {estOuvert && (
                  <div className="flex flex-col gap-5 border-t border-zinc-100 px-4 py-4">
                    {verrouillee && (
                      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                        🔒 Cette fiche est verrouillée — déverrouille-la pour la modifier.
                      </p>
                    )}
                    <div className="flex flex-col gap-4">
                      {CRITERES_STAGIAIRE.map((cat) => (
                        <div key={cat.cle}>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            {cat.categorie}
                          </p>
                          <div className="flex flex-col divide-y divide-zinc-100">
                            {cat.criteres.map((c) => {
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
                                        disabled={verrouillee}
                                        title={NIVEAU_CRITERE_LABELS[niveau]}
                                        onClick={() => majCritere(s.id, c.cle, niveau)}
                                        className={`h-7 w-11 rounded-md border text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
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
                          <p className="mb-1 mt-3 text-xs text-zinc-400">
                            Appréciation pour cette catégorie
                          </p>
                          <textarea
                            key={`${s.id}-${cat.cle}-appreciation`}
                            defaultValue={evaluation?.appreciations_categories?.[cat.cle] ?? ""}
                            onBlur={(e) =>
                              majAppreciationCategorie(s.id, cat.cle, e.target.value)
                            }
                            disabled={verrouillee}
                            rows={2}
                            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
                          />
                        </div>
                      ))}
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
                        disabled={verrouillee}
                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
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
                        disabled={verrouillee}
                        rows={3}
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
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
                        disabled={verrouillee}
                        rows={3}
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
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
        <div className="print-portrait hidden print:block">
          {stagiaires
            .filter((s) => !impressionCiblee || s.id === impressionCiblee)
            .map((s) => {
              const evaluation = evaluationDe(s.id);
              const autoEvaluation = autoEvaluationDe(s.id);
              return (
                <div key={s.id} className="print-page">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-xl font-bold text-zinc-900">
                      Fiche d&apos;évaluation BAFA — stage pratique
                    </h2>
                    <p className="text-sm text-zinc-600">
                      {s.prenom} {s.nom}
                      {s.stagiaire_confiance ? " · Autonomie de confiance" : ""}
                    </p>
                  </div>

                  <GrilleCriteresPrint
                    criteresDirection={evaluation?.criteres ?? null}
                    criteresStagiaire={autoEvaluation?.criteres ?? null}
                    appreciations={evaluation?.appreciations_categories}
                  />

                  {/* Bas de fiche dans un cadre fermé, insécable, aligné sur
                      la grille au-dessus. */}
                  <div className="mt-4 break-inside-avoid border border-black text-xs leading-snug">
                    <p className="border-b border-black bg-zinc-200 px-2 py-1.5">
                      <span className="font-semibold">Avis final : </span>
                      {evaluation?.avis_final ? AVIS_FINAL_LABELS[evaluation.avis_final] : "—"}
                    </p>

                    <div className="grid grid-cols-2">
                      <div className="border-r border-black px-2 py-1.5">
                        <p className="font-semibold">Appréciation générale</p>
                        <p className="mt-1 whitespace-pre-wrap text-zinc-700">
                          {evaluation?.appreciation_generale || "—"}
                        </p>
                      </div>
                      <div className="px-2 py-1.5">
                        <p className="font-semibold">Axes de progrès</p>
                        <p className="mt-1 whitespace-pre-wrap text-zinc-700">
                          {evaluation?.axes_progres || "—"}
                        </p>
                      </div>
                    </div>

                    {autoEvaluation?.commentaire && (
                      <div className="border-t border-black px-2 py-1.5">
                        <p className="font-semibold">Commentaire du stagiaire</p>
                        <p className="mt-1 whitespace-pre-wrap text-zinc-700">
                          {autoEvaluation.commentaire}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
