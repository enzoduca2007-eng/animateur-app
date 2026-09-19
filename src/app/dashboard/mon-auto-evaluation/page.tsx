"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import {
  CRITERES_STAGIAIRE,
  NIVEAU_CRITERE_ABBREV,
  NIVEAU_CRITERE_LABELS,
  type Animateur,
  type AutoEvaluationStagiaire,
  type NiveauCritere,
} from "@/lib/types";

const COULEUR_NIVEAU: Record<NiveauCritere, string> = {
  a_travailler: "border-red-300 bg-red-100 text-red-700",
  en_cours: "border-amber-300 bg-amber-100 text-amber-700",
  acquis: "border-emerald-300 bg-emerald-100 text-emerald-700",
  depasse: "border-indigo-300 bg-indigo-100 text-indigo-700",
};

const NIVEAUX: NiveauCritere[] = ["a_travailler", "en_cours", "acquis", "depasse"];

export default function MonAutoEvaluationPage() {
  const profile = useProfile();
  const supabase = createClient();

  const [moi, setMoi] = useState<Animateur | null>(null);
  const [evaluation, setEvaluation] = useState<AutoEvaluationStagiaire | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("animateurs")
      .select("*")
      .eq("profile_id", profile.id)
      .maybeSingle()
      .then(({ data }) => {
        setMoi((data as Animateur) ?? null);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!moi) return;
    supabase
      .from("auto_evaluations_stagiaire")
      .select("*")
      .eq("animateur_id", moi.id)
      .maybeSingle()
      .then(({ data }) => {
        setEvaluation((data as AutoEvaluationStagiaire) ?? null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moi]);

  async function majEvaluation(
    updates: Partial<Pick<AutoEvaluationStagiaire, "criteres" | "commentaire">>
  ) {
    if (!moi) return;
    setErreur(null);
    const payload = {
      criteres: evaluation?.criteres ?? {},
      commentaire: evaluation?.commentaire ?? null,
      ...updates,
    };

    setEvaluation({
      id: evaluation?.id ?? "optimistic",
      animateur_id: moi.id,
      created_at: evaluation?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...payload,
    });

    const { error } = await supabase
      .from("auto_evaluations_stagiaire")
      .upsert({ animateur_id: moi.id, ...payload }, { onConflict: "animateur_id" });
    if (error) setErreur(error.message);
  }

  function majCritere(critere: string, niveau: NiveauCritere) {
    majEvaluation({ criteres: { ...(evaluation?.criteres ?? {}), [critere]: niveau } });
  }

  if (loading) {
    return <p className="text-sm text-zinc-400">Chargement...</p>;
  }

  if (!moi || !moi.est_stagiaire) {
    return (
      <p className="text-sm text-zinc-500">
        Cette page est réservée aux animateurs marqués &laquo;&nbsp;stagiaire&nbsp;&raquo;.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Mon auto-évaluation</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Évalue-toi toi-même sur les mêmes critères que la direction — les
          deux avis seront comparés lors du bilan de stage pratique.
        </p>
      </div>

      {erreur && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {erreur}
        </p>
      )}

      <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        {CRITERES_STAGIAIRE.map((cat) => (
          <div key={cat.cle}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {cat.categorie}
            </p>
            <div className="flex flex-col divide-y divide-zinc-100">
              {cat.criteres.map((c) => {
                const niveauActuel = evaluation?.criteres?.[c.cle];
                return (
                  <div key={c.cle} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm text-zinc-700">{c.label}</span>
                    <div className="flex shrink-0 gap-1">
                      {NIVEAUX.map((niveau) => (
                        <button
                          key={niveau}
                          type="button"
                          title={NIVEAU_CRITERE_LABELS[niveau]}
                          onClick={() => majCritere(c.cle, niveau)}
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
          </div>
        ))}
      </div>

      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Commentaire
        </p>
        <textarea
          defaultValue={evaluation?.commentaire ?? ""}
          onBlur={(e) => majEvaluation({ commentaire: e.target.value || null })}
          rows={4}
          placeholder="Ce que tu retiens de ton stage, tes difficultés, ce dont tu es fier..."
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}
