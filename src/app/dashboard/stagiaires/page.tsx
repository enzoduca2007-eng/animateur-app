"use client";

import { Fragment, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
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

const NIVEAUX: NiveauCritere[] = ["a_travailler", "en_cours", "acquis", "depasse"];

// Marque d'un critère : X orange (direction) et/ou X bleu (stagiaire).
// Quand les deux ont choisi le même niveau, la croix est entourée d'un
// anneau bleu — les deux couleurs indiquent l'accord en un coup d'œil,
// sans dupliquer la case.
function MarqueNiveau({
  dir,
  stag,
  niveau,
}: {
  dir?: NiveauCritere;
  stag?: NiveauCritere;
  niveau: NiveauCritere;
}) {
  const dirMatch = dir === niveau;
  const stagMatch = stag === niveau;
  if (dirMatch && stagMatch) {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-sky-500 bg-orange-200 text-[10px] font-bold leading-none text-orange-800">
        X
      </span>
    );
  }
  if (dirMatch) {
    return <span className="text-xs font-bold text-orange-700">X</span>;
  }
  if (stagMatch) {
    return <span className="text-xs font-bold text-sky-700">X</span>;
  }
  return null;
}

// Grille imprimable fusionnant l'évaluation de la direction et
// l'auto-évaluation du stagiaire dans la même case (voir MarqueNiveau)
// — plus besoin de deux grilles séparées. Colonnes AT/ECA/A/D de même
// largeur, plus une grande case Appréciation à droite (fusionnée sur
// toutes les lignes d'une catégorie) pour le commentaire de la
// direction sur cette catégorie. Pas de ligne entre les critères d'une
// même catégorie, seulement les colonnes restent séparées, et un
// trait ferme chaque catégorie.
function GrilleCriteresPrint({
  criteresDirection,
  criteresStagiaire,
  appreciations,
}: {
  criteresDirection: Partial<Record<string, NiveauCritere>> | null;
  criteresStagiaire?: Partial<Record<string, NiveauCritere>> | null;
  appreciations?: Partial<Record<string, string>> | null;
}) {
  return (
    <>
      <p className="mt-3 text-xs text-zinc-500">
        {NIVEAUX.map((n) => `${NIVEAU_CRITERE_ABBREV[n]} = ${NIVEAU_CRITERE_LABELS[n]}`).join(
          " · "
        )}
        {" — "}
        <span className="font-bold text-orange-700">X orange</span> = Direction ·{" "}
        <span className="font-bold text-sky-700">X bleu</span> = Stagiaire · anneau bleu = même
        avis
      </p>
      {/* border-separate (pas collapse) : même bug moteur d'impression Chrome
          que sur Répartition — border-collapse + cellule rowSpan (colonne
          Appréciation ici) fait disparaître le contenu qui déborde sur une
          2e page au lieu de la paginer. Colonne Critère élargie (45% au
          lieu de 28%) : les libellés longs ("Comprend et respecte le
          projet pédagogique...") passaient sur 2-3 lignes et gonflaient
          la hauteur du tableau bien au-delà d'une page. */}
      <table className="mt-2 w-full table-fixed border-separate border-spacing-0 text-left text-[11px] leading-tight">
        <colgroup>
          <col className="w-[45%]" />
          {NIVEAUX.map((n) => (
            <col key={n} className="w-[8%]" />
          ))}
          <col className="w-[23%]" />
        </colgroup>
        <thead>
          <tr>
            <th className="border border-black px-2 py-1 font-semibold">Critère</th>
            {NIVEAUX.map((niveau) => (
              <th
                key={niveau}
                className="border border-black px-1 py-1 text-center font-semibold"
              >
                {NIVEAU_CRITERE_ABBREV[niveau]}
              </th>
            ))}
            <th className="border border-black px-2 py-1 font-semibold">Appréciation</th>
          </tr>
        </thead>
        <tbody>
          {CRITERES_STAGIAIRE.map((cat) => {
            const texteAppreciation = appreciations?.[cat.cle];
            return (
              <Fragment key={cat.cle}>
                <tr>
                  <td
                    colSpan={2 + NIVEAUX.length}
                    className="border border-black bg-zinc-200 px-2 py-0.5 font-semibold"
                  >
                    {cat.categorie}
                  </td>
                </tr>
                {cat.criteres.map((c, idx) => {
                  const dernier = idx === cat.criteres.length - 1;
                  const bordureBas = dernier ? "border-b border-black" : "";
                  return (
                    <tr key={c.cle}>
                      <td className={`border-x border-black px-2 py-1.5 ${bordureBas}`}>
                        {c.label}
                      </td>
                      {NIVEAUX.map((niveau) => (
                        <td
                          key={niveau}
                          className={`border-x border-black px-1 py-1.5 text-center ${bordureBas}`}
                        >
                          <MarqueNiveau
                            dir={criteresDirection?.[c.cle]}
                            stag={criteresStagiaire?.[c.cle]}
                            niveau={niveau}
                          />
                        </td>
                      ))}
                      {idx === 0 && (
                        <td
                          rowSpan={cat.criteres.length}
                          className="border-x border-b border-black px-2 py-1.5 align-top whitespace-pre-wrap text-zinc-700"
                        >
                          {texteAppreciation ?? ""}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

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
    requestAnimationFrame(() => window.print());
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
                    {autoEvaluation && Object.keys(autoEvaluation.criteres).length > 0 && (
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-600">
                        Auto-éval reçue
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
                          <p className="mb-1 mt-3 text-xs text-zinc-400">
                            Appréciation pour cette catégorie
                          </p>
                          <textarea
                            key={`${s.id}-${cat.cle}-appreciation`}
                            defaultValue={evaluation?.appreciations_categories?.[cat.cle] ?? ""}
                            onBlur={(e) =>
                              majAppreciationCategorie(s.id, cat.cle, e.target.value)
                            }
                            rows={2}
                            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
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

                  <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    <p className="col-span-2">
                      <span className="font-semibold">Avis final : </span>
                      {evaluation?.avis_final ? AVIS_FINAL_LABELS[evaluation.avis_final] : "—"}
                    </p>

                    <div>
                      <p className="font-semibold">Appréciation générale</p>
                      <p className="mt-1 whitespace-pre-wrap text-zinc-700">
                        {evaluation?.appreciation_generale || "—"}
                      </p>
                    </div>

                    <div>
                      <p className="font-semibold">Axes de progrès</p>
                      <p className="mt-1 whitespace-pre-wrap text-zinc-700">
                        {evaluation?.axes_progres || "—"}
                      </p>
                    </div>

                    {autoEvaluation?.commentaire && (
                      <div className="col-span-2">
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
