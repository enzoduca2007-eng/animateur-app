"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { useVacances } from "@/lib/use-vacances";
import { estWeekend, joursDe, periodeEnCours } from "@/lib/vacances";
import { PeriodesVacances } from "@/components/periodes-vacances";
import {
  GROUPES,
  GROUPE_LABELS,
  type AffectationJour,
  type Animateur,
  type Gouter,
  type Groupe,
} from "@/lib/types";

const STATUT_LABELS: Record<Gouter["statut_ia"], { texte: string; classe: string }> = {
  en_attente: { texte: "En attente de photo", classe: "bg-zinc-100 text-zinc-500" },
  traite: { texte: "Analysé par l'IA", classe: "bg-emerald-100 text-emerald-700" },
  echec: { texte: "Analyse IA échouée", classe: "bg-red-100 text-red-700" },
};

function formatJourLong(dateISO: string) {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default function GoutersPage() {
  const profile = useProfile();
  const supabase = createClient();
  const { periodes, zone, loading: loadingVacances } = useVacances();

  const monGroupe = profile.role === "coordinateur" ? profile.groupe_coordinateur : null;

  function peutGererGroupe(groupe: Groupe) {
    if (profile.role === "directeur") return true;
    if (profile.role !== "coordinateur") return false;
    return !monGroupe || monGroupe === groupe;
  }

  const [periodeIndex, setPeriodeIndex] = useState<number | null>(null);
  const [jour, setJour] = useState<string | null>(null);
  const [gouters, setGouters] = useState<Gouter[]>([]);
  const [monAnimateur, setMonAnimateur] = useState<Animateur | null>(null);
  const [mesAffectations, setMesAffectations] = useState<AffectationJour[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState<Record<string, boolean>>({});
  const [nouveaux, setNouveaux] = useState<Record<Groupe, { type_produit: string; marque: string }>>(
    { lutins: { type_produit: "", marque: "" }, trolls: { type_produit: "", marque: "" }, geants: { type_produit: "", marque: "" } }
  );

  useEffect(() => {
    supabase
      .from("animateurs")
      .select("*")
      .eq("profile_id", profile.id)
      .maybeSingle()
      .then(({ data }) => setMonAnimateur((data as Animateur) ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!monAnimateur) return;
    supabase
      .from("affectations_jour")
      .select("*")
      .eq("animateur_id", monAnimateur.id)
      .then(({ data }) => setMesAffectations((data as AffectationJour[]) ?? []));
  }, [monAnimateur, supabase]);

  function estAffecteCeJour(groupe: Groupe, date: string) {
    return mesAffectations.some((a) => a.groupe === groupe && a.date === date);
  }

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
  const joursOuvrables = useMemo(
    () => (periode ? joursDe(periode).filter((j) => !estWeekend(j)) : []),
    [periode]
  );

  useEffect(() => {
    if (joursOuvrables.length === 0) return;
    const aujourdhui = new Date().toISOString().slice(0, 10);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJour((prev) =>
      prev && joursOuvrables.includes(prev)
        ? prev
        : joursOuvrables.includes(aujourdhui)
          ? aujourdhui
          : joursOuvrables[0]
    );
  }, [joursOuvrables]);

  // Un animateur (sans droits de gestion) ne voit que le groupe auquel il
  // est affecté ce jour-là via la Répartition, pour ne pas s'encombrer des
  // 2 autres groupes qu'il ne peut pas gérer de toute façon.
  const groupesGeres = useMemo(() => {
    if (monGroupe) return GROUPES.filter((g) => g === monGroupe);
    if (profile.role !== "animateur") return GROUPES;
    if (!jour) return [];
    return GROUPES.filter((g) =>
      mesAffectations.some((a) => a.groupe === g && a.date === jour)
    );
  }, [monGroupe, profile.role, jour, mesAffectations]);

  async function chargerGouters() {
    if (!jour) return;
    setLoading(true);
    const { data } = await supabase.from("gouters").select("*").eq("date", jour);
    setGouters((data as Gouter[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    chargerGouters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jour]);

  async function ajouterProduit(groupe: Groupe) {
    if (!jour) return;
    const form = nouveaux[groupe];
    if (!form.type_produit.trim() || !form.marque.trim()) return;
    setErreur(null);
    const { error } = await supabase.from("gouters").insert({
      date: jour,
      groupe,
      type_produit: form.type_produit.trim(),
      marque: form.marque.trim(),
      created_by: profile.id,
    });
    if (error) {
      setErreur(error.message);
      return;
    }
    setNouveaux((prev) => ({ ...prev, [groupe]: { type_produit: "", marque: "" } }));
    chargerGouters();
  }

  async function supprimerProduit(id: string) {
    if (!confirm("Supprimer ce produit ?")) return;
    await supabase.from("gouters").delete().eq("id", id);
    chargerGouters();
  }

  async function envoyerPhoto(gouter: Gouter, file: File) {
    setErreur(null);
    setEnvoiEnCours((prev) => ({ ...prev, [gouter.id]: true }));
    try {
      const chemin = `${gouter.id}/${Date.now()}-${file.name}`;
      const { error: erreurUpload } = await supabase.storage
        .from("gouters")
        .upload(chemin, file, { upsert: true });
      if (erreurUpload) throw erreurUpload;

      const { data: pub } = supabase.storage.from("gouters").getPublicUrl(chemin);

      const { error: erreurMaj } = await supabase
        .from("gouters")
        .update({
          photo_url: pub.publicUrl,
          rempli_par: profile.id,
          statut_ia: "en_attente",
          erreur_ia: null,
        })
        .eq("id", gouter.id);
      if (erreurMaj) throw erreurMaj;

      const res = await fetch("/api/gouters/analyser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gouterId: gouter.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Analyse IA échouée.");

      chargerGouters();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur lors de l'envoi de la photo.");
      chargerGouters();
    } finally {
      setEnvoiEnCours((prev) => ({ ...prev, [gouter.id]: false }));
    }
  }

  async function majChamp(id: string, champ: "nom_produit" | "numero_lot" | "date_peremption" | "quantite", valeur: string) {
    setGouters((prev) => prev.map((g) => (g.id === id ? { ...g, [champ]: valeur || null } : g)));
    await supabase.from("gouters").update({ [champ]: valeur || null }).eq("id", id);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Goûters</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Traçabilité alimentaire : type de produit et marque saisis par le
          directeur/coordinateur, photo de l&apos;emballage prise par
          l&apos;animateur du groupe puis analysée automatiquement (numéro de
          lot, DLC, nom du produit, quantité).
        </p>
      </div>

      <PeriodesVacances periodes={periodes} zone={zone} loading={loadingVacances} />

      {erreur && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {erreur}
        </p>
      )}

      {loadingVacances || periodeIndex === null ? (
        <p className="text-sm text-zinc-400">Chargement...</p>
      ) : periodes.length === 0 ? (
        <p className="text-sm text-zinc-400">Aucune période de vacances trouvée.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                Période
              </p>
              <select
                value={periodeIndex}
                onChange={(e) => {
                  setPeriodeIndex(Number(e.target.value));
                  setJour(null);
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
              <select
                value={jour ?? ""}
                onChange={(e) => setJour(e.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm capitalize"
              >
                {joursOuvrables.map((j) => (
                  <option key={j} value={j} className="capitalize">
                    {formatJourLong(j)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-zinc-400">Chargement...</p>
          ) : groupesGeres.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Tu n&apos;es affecté à aucun groupe ce jour-là.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {groupesGeres.map((groupe) => {
                const produits = gouters.filter((g) => g.groupe === groupe);
                const gererGroupe = peutGererGroupe(groupe);
                return (
                  <div
                    key={groupe}
                    className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
                  >
                    <h2 className="text-lg font-semibold text-zinc-900">
                      {GROUPE_LABELS[groupe]}
                    </h2>

                    <div className="mt-3 flex flex-col gap-4">
                      {produits.length === 0 && (
                        <p className="text-sm text-zinc-400">
                          Aucun produit renseigné pour ce jour.
                        </p>
                      )}
                      {produits.map((g) => {
                        const peutPhoto =
                          gererGroupe ||
                          (monAnimateur && estAffecteCeJour(groupe, g.date));
                        const statut = STATUT_LABELS[g.statut_ia];
                        return (
                          <div
                            key={g.id}
                            className="rounded-lg border border-zinc-200 p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-medium text-zinc-900">
                                  {g.type_produit} · {g.marque}
                                </p>
                                <span
                                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${statut.classe}`}
                                >
                                  {statut.texte}
                                </span>
                                {g.statut_ia === "echec" && g.erreur_ia && (
                                  <p className="mt-1 text-xs text-red-600">{g.erreur_ia}</p>
                                )}
                              </div>
                              {gererGroupe && (
                                <button
                                  onClick={() => supprimerProduit(g.id)}
                                  className="text-xs text-red-500 hover:text-red-700"
                                >
                                  Supprimer
                                </button>
                              )}
                            </div>

                            {g.photo_url && (
                              <a
                                href={g.photo_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 block"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={g.photo_url}
                                  alt="Emballage du produit"
                                  className="h-24 w-24 rounded-md border border-zinc-200 object-cover"
                                />
                              </a>
                            )}

                            {peutPhoto && (
                              <div className="mt-3">
                                <label className="text-xs font-medium text-zinc-500">
                                  {g.photo_url ? "Remplacer la photo" : "Ajouter une photo"}
                                </label>
                                <input
                                  type="file"
                                  accept="image/*"
                                  disabled={!!envoiEnCours[g.id]}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) envoyerPhoto(g, file);
                                    e.target.value = "";
                                  }}
                                  className="mt-1 block text-sm"
                                />
                                {envoiEnCours[g.id] && (
                                  <p className="mt-1 text-xs text-zinc-400">
                                    Envoi et analyse en cours...
                                  </p>
                                )}
                              </div>
                            )}

                            {(g.nom_produit || g.numero_lot || g.date_peremption || g.quantite || g.statut_ia === "traite") && (
                              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <div>
                                  <label className="text-xs text-zinc-400">Nom produit</label>
                                  <input
                                    value={g.nom_produit ?? ""}
                                    disabled={!peutPhoto}
                                    onChange={(e) => majChamp(g.id, "nom_produit", e.target.value)}
                                    className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-50"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-zinc-400">N° de lot</label>
                                  <input
                                    value={g.numero_lot ?? ""}
                                    disabled={!peutPhoto}
                                    onChange={(e) => majChamp(g.id, "numero_lot", e.target.value)}
                                    className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-50"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-zinc-400">DLC/DLUO</label>
                                  <input
                                    type="date"
                                    value={g.date_peremption ?? ""}
                                    disabled={!peutPhoto}
                                    onChange={(e) => majChamp(g.id, "date_peremption", e.target.value)}
                                    className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-50"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-zinc-400">Quantité</label>
                                  <input
                                    value={g.quantite ?? ""}
                                    disabled={!peutPhoto}
                                    onChange={(e) => majChamp(g.id, "quantite", e.target.value)}
                                    className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-50"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {gererGroupe && (
                      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-4">
                        <div>
                          <label className="text-xs text-zinc-400">Type de produit</label>
                          <input
                            value={nouveaux[groupe].type_produit}
                            onChange={(e) =>
                              setNouveaux((prev) => ({
                                ...prev,
                                [groupe]: { ...prev[groupe], type_produit: e.target.value },
                              }))
                            }
                            placeholder="Ex: Biscuits"
                            className="mt-0.5 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-zinc-400">Marque</label>
                          <input
                            value={nouveaux[groupe].marque}
                            onChange={(e) =>
                              setNouveaux((prev) => ({
                                ...prev,
                                [groupe]: { ...prev[groupe], marque: e.target.value },
                              }))
                            }
                            placeholder="Ex: LU"
                            className="mt-0.5 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <button
                          onClick={() => ajouterProduit(groupe)}
                          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
                        >
                          + Ajouter
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
