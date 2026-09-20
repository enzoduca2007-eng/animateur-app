"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { useVacances } from "@/lib/use-vacances";
import { estWeekend, joursDe, periodeEnCours } from "@/lib/vacances";
import { PeriodesVacances } from "@/components/periodes-vacances";
import {
  canManage,
  GROUPES,
  GROUPE_LABELS,
  type AffectationJour,
  type Animateur,
  type EffectifJour,
  type Gouter,
  type GouterPrevu,
  type Groupe,
  type ProduitGouter,
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

function formatJourCourt(dateISO: string) {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function formatDatePeremption(dateISO: string | null) {
  if (!dateISO) return "—";
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
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
  const [goutersPeriode, setGoutersPeriode] = useState<Gouter[]>([]);
  const [monAnimateur, setMonAnimateur] = useState<Animateur | null>(null);
  const [mesAffectations, setMesAffectations] = useState<AffectationJour[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState<Record<string, boolean>>({});
  const [importEnCours, setImportEnCours] = useState<
    Partial<Record<Groupe, { fait: number; total: number }>>
  >({});
  const [nouveaux, setNouveaux] = useState<Record<Groupe, { type_produit: string; marque: string }>>(
    { lutins: { type_produit: "", marque: "" }, trolls: { type_produit: "", marque: "" } }
  );

  // Prévisionnel d'achats : produits configurés (bichocos, jus...), le
  // goûter choisi pour chaque (jour, groupe) — peut différer d'un
  // groupe à l'autre — et les effectifs/animateurs de la période pour
  // en déduire la quantité à acheter.
  const [produits, setProduits] = useState<ProduitGouter[]>([]);
  const [goutersPrevus, setGoutersPrevus] = useState<GouterPrevu[]>([]);
  const [effectifsPeriode, setEffectifsPeriode] = useState<EffectifJour[]>([]);
  const [affectationsJourPeriode, setAffectationsJourPeriode] = useState<AffectationJour[]>([]);
  const [nouveauProduit, setNouveauProduit] = useState({
    nom: "",
    quantite_par_personne: "2",
    taille_paquet: "20",
  });
  const compteurUpload = useRef(0);

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

  // Pour le tableau d'impression (toute la période, pas juste le jour
  // affiché à l'écran) — réservé au directeur/coordinateur.
  async function chargerGoutersPeriode() {
    if (!periode || !canManage(profile.role)) return;
    const { data } = await supabase
      .from("gouters")
      .select("*")
      .gte("date", periode.debut)
      .lte("date", periode.fin);
    setGoutersPeriode((data as Gouter[]) ?? []);
  }

  function rechargerTout() {
    chargerGouters();
    chargerGoutersPeriode();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    chargerGouters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jour]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    chargerGoutersPeriode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode, profile.role]);

  useEffect(() => {
    supabase
      .from("produits_gouter")
      .select("*")
      .order("nom")
      .then(({ data }) => setProduits((data as ProduitGouter[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!periode || !canManage(profile.role)) return;
    Promise.all([
      supabase
        .from("effectifs_jour")
        .select("*")
        .gte("date", periode.debut)
        .lte("date", periode.fin),
      supabase
        .from("affectations_jour")
        .select("*")
        .gte("date", periode.debut)
        .lte("date", periode.fin),
      supabase
        .from("gouters_prevus")
        .select("*")
        .gte("date", periode.debut)
        .lte("date", periode.fin),
    ]).then(([{ data: e }, { data: aj }, { data: gp }]) => {
      setEffectifsPeriode((e as EffectifJour[]) ?? []);
      setAffectationsJourPeriode((aj as AffectationJour[]) ?? []);
      setGoutersPrevus((gp as GouterPrevu[]) ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode, profile.role]);

  // Effectif + animateurs affectés à CE groupe précis ce jour-là (le
  // goûter prévu peut différer d'un groupe à l'autre).
  function totalPersonnesDuGroupe(groupe: Groupe, date: string) {
    const effectifEnfants = effectifsPeriode
      .filter((e) => e.date === date && e.groupe === groupe)
      .reduce((s, e) => s + e.effectif, 0);
    const nbAnimateurs = new Set(
      affectationsJourPeriode
        .filter((a) => a.date === date && a.groupe === groupe)
        .map((a) => a.animateur_id)
    ).size;
    return effectifEnfants + nbAnimateurs;
  }

  function paquetsNecessaires(produit: ProduitGouter, groupe: Groupe, date: string) {
    const total = totalPersonnesDuGroupe(groupe, date) * produit.quantite_par_personne;
    if (total === 0) return { quantite: 0, paquets: 0 };
    return { quantite: total, paquets: Math.ceil(total / produit.taille_paquet) + 1 };
  }

  function prevuDe(groupe: Groupe, date: string) {
    return goutersPrevus.find((g) => g.date === date && g.groupe === groupe);
  }

  async function choisirGouterPrevu(groupe: Groupe, date: string, produitId: string) {
    setErreur(null);
    const existant = prevuDe(groupe, date);

    if (!produitId) {
      setGoutersPrevus((prev) => prev.filter((g) => !(g.date === date && g.groupe === groupe)));
      if (existant) {
        const { error } = await supabase.from("gouters_prevus").delete().eq("id", existant.id);
        if (error) setErreur(error.message);
      }
      return;
    }

    setGoutersPrevus((prev) => [
      ...prev.filter((g) => !(g.date === date && g.groupe === groupe)),
      {
        id: existant?.id ?? `optimistic-${groupe}-${date}`,
        date,
        groupe,
        produit_id: produitId,
        created_by: profile.id,
        created_at: existant?.created_at ?? new Date().toISOString(),
      },
    ]);

    const { error } = await supabase
      .from("gouters_prevus")
      .upsert(
        { date, groupe, produit_id: produitId, created_by: profile.id },
        { onConflict: "date,groupe" }
      );
    if (error) setErreur(error.message);
  }

  async function ajouterProduitGouter() {
    const nom = nouveauProduit.nom.trim();
    const qte = Number(nouveauProduit.quantite_par_personne);
    const taille = Number(nouveauProduit.taille_paquet);
    if (!nom || !qte || !taille) return;
    setErreur(null);
    const { data, error } = await supabase
      .from("produits_gouter")
      .insert({
        nom,
        quantite_par_personne: qte,
        taille_paquet: taille,
        created_by: profile.id,
      })
      .select()
      .single();
    if (error) {
      setErreur(error.message);
      return;
    }
    setProduits((prev) => [...prev, data as ProduitGouter].sort((a, b) => a.nom.localeCompare(b.nom)));
    setNouveauProduit({ nom: "", quantite_par_personne: "2", taille_paquet: "20" });
  }

  async function majProduitGouter(id: string, updates: Partial<ProduitGouter>) {
    setProduits((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    await supabase.from("produits_gouter").update(updates).eq("id", id);
  }

  async function supprimerProduitGouter(id: string) {
    if (!confirm("Supprimer ce produit du prévisionnel ?")) return;
    setProduits((prev) => prev.filter((p) => p.id !== id));
    await supabase.from("produits_gouter").delete().eq("id", id);
  }

  const goutersImprimables = useMemo(
    () =>
      goutersPeriode
        .filter((g) => !monGroupe || g.groupe === monGroupe)
        .sort((a, b) => (a.date + a.groupe).localeCompare(b.date + b.groupe)),
    [goutersPeriode, monGroupe]
  );

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
    rechargerTout();
  }

  async function supprimerProduit(id: string) {
    if (!confirm("Supprimer ce produit ?")) return;
    await supabase.from("gouters").delete().eq("id", id);
    rechargerTout();
  }

  async function envoyerPhoto(gouter: Gouter, file: File) {
    setErreur(null);
    setEnvoiEnCours((prev) => ({ ...prev, [gouter.id]: true }));
    try {
      compteurUpload.current += 1;
      const chemin = `${gouter.id}/${compteurUpload.current}-${file.name}`;
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

      rechargerTout();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur lors de l'envoi de la photo.");
      rechargerTout();
    } finally {
      setEnvoiEnCours((prev) => ({ ...prev, [gouter.id]: false }));
    }
  }

  async function majChamp(
    id: string,
    champ: "type_produit" | "marque" | "nom_produit" | "numero_lot" | "date_peremption" | "quantite",
    valeur: string
  ) {
    setGouters((prev) => prev.map((g) => (g.id === id ? { ...g, [champ]: valeur || null } : g)));
    setGoutersPeriode((prev) => prev.map((g) => (g.id === id ? { ...g, [champ]: valeur || null } : g)));
    await supabase.from("gouters").update({ [champ]: valeur || null }).eq("id", id);
  }

  // Import en masse : une photo = une fiche créée automatiquement (sans
  // passer par la saisie manuelle du type/marque), analysée par l'IA.
  async function importerPlusieursPhotos(groupe: Groupe, files: FileList | null) {
    if (!jour || !files || files.length === 0) return;
    const liste = Array.from(files);
    setErreur(null);
    setImportEnCours((prev) => ({ ...prev, [groupe]: { fait: 0, total: liste.length } }));

    for (let i = 0; i < liste.length; i++) {
      const { data, error } = await supabase
        .from("gouters")
        .insert({ date: jour, groupe, created_by: profile.id })
        .select("*")
        .single();
      if (error || !data) {
        setErreur(error?.message ?? "Erreur lors de la création de la fiche.");
      } else {
        await envoyerPhoto(data as Gouter, liste[i]);
      }
      setImportEnCours((prev) => ({ ...prev, [groupe]: { fait: i + 1, total: liste.length } }));
    }

    setImportEnCours((prev) => ({ ...prev, [groupe]: undefined }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print">
        <h1 className="text-2xl font-semibold text-zinc-900">Goûters</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Traçabilité alimentaire : l&apos;animateur du groupe importe toutes
          les photos des emballages d&apos;un coup, l&apos;IA reconnaît
          automatiquement le produit, la marque, le numéro de lot, la DLC et
          la quantité de chacun. Tout reste corrigible à la main en cas
          d&apos;erreur de lecture.
        </p>
      </div>

      <div className="no-print">
        <PeriodesVacances periodes={periodes} zone={zone} loading={loadingVacances} />
      </div>

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
          <div className="no-print flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
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
            {canManage(profile.role) && (
              <button
                onClick={() => window.print()}
                className="ml-auto rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Imprimer le tableau de traçabilité
              </button>
            )}
          </div>

          {canManage(profile.role) && (
            <div className="no-print flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  Prévisionnel d&apos;achats — {periode?.description}
                </h2>
                <p className="mt-1 text-xs text-zinc-400">
                  Paquets à prendre chaque jour = (effectif enfants + animateurs affectés) ×
                  quantité/personne, arrondi au paquet supérieur, + 1 de secours.
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">Produit</label>
                  <input
                    value={nouveauProduit.nom}
                    onChange={(e) =>
                      setNouveauProduit((p) => ({ ...p, nom: e.target.value }))
                    }
                    placeholder="ex. Bichocos"
                    className="w-40 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">Quantité / personne</label>
                  <input
                    type="number"
                    min={1}
                    value={nouveauProduit.quantite_par_personne}
                    onChange={(e) =>
                      setNouveauProduit((p) => ({ ...p, quantite_par_personne: e.target.value }))
                    }
                    className="w-28 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">Taille du paquet</label>
                  <input
                    type="number"
                    min={1}
                    value={nouveauProduit.taille_paquet}
                    onChange={(e) =>
                      setNouveauProduit((p) => ({ ...p, taille_paquet: e.target.value }))
                    }
                    className="w-28 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <button
                  onClick={ajouterProduitGouter}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  + Ajouter le produit
                </button>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Catalogue
                </p>
                {produits.length === 0 ? (
                  <p className="text-sm text-zinc-400">
                    Aucun produit configuré pour l&apos;instant.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {produits.map((produit) => (
                      <div
                        key={produit.id}
                        className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-2 py-1"
                      >
                        <input
                          defaultValue={produit.nom}
                          onBlur={(e) =>
                            e.target.value.trim() &&
                            majProduitGouter(produit.id, { nom: e.target.value.trim() })
                          }
                          className="w-24 rounded border border-transparent px-1 py-0.5 text-sm font-medium hover:border-zinc-200 focus:border-zinc-300 focus:outline-none"
                        />
                        <span className="flex items-center gap-1 text-[11px] text-zinc-400">
                          <input
                            type="number"
                            min={1}
                            defaultValue={produit.quantite_par_personne}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v > 0) majProduitGouter(produit.id, { quantite_par_personne: v });
                            }}
                            className="w-8 rounded border border-transparent px-1 hover:border-zinc-200 focus:border-zinc-300 focus:outline-none"
                          />
                          /pers., paquet de
                          <input
                            type="number"
                            min={1}
                            defaultValue={produit.taille_paquet}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v > 0) majProduitGouter(produit.id, { taille_paquet: v });
                            }}
                            className="w-10 rounded border border-transparent px-1 hover:border-zinc-200 focus:border-zinc-300 focus:outline-none"
                          />
                        </span>
                        <button
                          onClick={() => supprimerProduitGouter(produit.id)}
                          title="Supprimer ce produit"
                          className="text-zinc-300 hover:text-red-600"
                        >
                          🗑
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {produits.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Goûter du jour par groupe
                  </p>
                  <div className="flex flex-col gap-2">
                    {joursOuvrables.map((j) => (
                      <div
                        key={j}
                        className="grid grid-cols-1 gap-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-[100px_1fr_1fr]"
                      >
                        <p className="text-sm font-semibold capitalize text-zinc-700">
                          {formatJourCourt(j)}
                        </p>
                        {GROUPES.map((g) => {
                          const prevu = prevuDe(g, j);
                          const produit = prevu
                            ? produits.find((p) => p.id === prevu.produit_id)
                            : null;
                          const { quantite, paquets } = produit
                            ? paquetsNecessaires(produit, g, j)
                            : { quantite: 0, paquets: 0 };
                          return (
                            <div key={g}>
                              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                                {GROUPE_LABELS[g]}
                              </p>
                              <select
                                value={prevu?.produit_id ?? ""}
                                onChange={(e) => choisirGouterPrevu(g, j, e.target.value)}
                                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
                              >
                                <option value="">— Choisir un goûter —</option>
                                {produits.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.nom}
                                  </option>
                                ))}
                              </select>
                              {produit && (
                                <p className="mt-1 text-xs text-zinc-600">
                                  {paquets > 0 ? (
                                    <>
                                      <span className="font-semibold text-zinc-900">
                                        {paquets} paquet{paquets > 1 ? "s" : ""}
                                      </span>{" "}
                                      <span className="text-zinc-400">
                                        ({quantite} unités, {totalPersonnesDuGroupe(g, j)} pers.)
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-zinc-300">
                                      Effectif non renseigné ce jour
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {canManage(profile.role) && (
            <div className="hidden print:block">
              <h2 className="text-lg font-bold text-zinc-900">
                Traçabilité des goûters
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                {periode?.description} ({periode?.debut} – {periode?.fin}) · Zone {zone}
                {monGroupe && ` · ${GROUPE_LABELS[monGroupe]}`}
              </p>
              <table className="mt-4 w-full border-collapse text-left text-xs">
                <thead>
                  <tr>
                    <th className="border border-black px-2 py-1 font-semibold capitalize">
                      Date
                    </th>
                    <th className="border border-black px-2 py-1 font-semibold">Groupe</th>
                    <th className="border border-black px-2 py-1 font-semibold">Type</th>
                    <th className="border border-black px-2 py-1 font-semibold">Marque</th>
                    <th className="border border-black px-2 py-1 font-semibold">Photo</th>
                    <th className="border border-black px-2 py-1 font-semibold">
                      Nom produit
                    </th>
                    <th className="border border-black px-2 py-1 font-semibold">
                      N° de lot
                    </th>
                    <th className="border border-black px-2 py-1 font-semibold">
                      DLC/DLUO
                    </th>
                    <th className="border border-black px-2 py-1 font-semibold">
                      Quantité
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {goutersImprimables.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="border border-black px-2 py-2 text-center text-zinc-500"
                      >
                        Aucun produit renseigné sur cette période.
                      </td>
                    </tr>
                  ) : (
                    goutersImprimables.map((g) => (
                      <tr key={g.id}>
                        <td className="border border-black px-2 py-1 capitalize">
                          {formatJourCourt(g.date)}
                        </td>
                        <td className="border border-black px-2 py-1">
                          {GROUPE_LABELS[g.groupe]}
                        </td>
                        <td className="border border-black px-2 py-1">{g.type_produit || "—"}</td>
                        <td className="border border-black px-2 py-1">{g.marque || "—"}</td>
                        <td className="border border-black px-2 py-1">
                          {g.photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={g.photo_url}
                              alt=""
                              className="h-14 w-14 object-cover"
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="border border-black px-2 py-1">
                          {g.nom_produit || "—"}
                        </td>
                        <td className="border border-black px-2 py-1">
                          {g.numero_lot || "—"}
                        </td>
                        <td className="border border-black px-2 py-1">
                          {formatDatePeremption(g.date_peremption)}
                        </td>
                        <td className="border border-black px-2 py-1">
                          {g.quantite || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {loading ? (
            <p className="no-print text-sm text-zinc-400">Chargement...</p>
          ) : groupesGeres.length === 0 ? (
            <p className="no-print text-sm text-zinc-400">
              Tu n&apos;es affecté à aucun groupe ce jour-là.
            </p>
          ) : (
            <div className="no-print flex flex-col gap-5">
              {groupesGeres.map((groupe) => {
                const produits = gouters.filter((g) => g.groupe === groupe);
                const gererGroupe = peutGererGroupe(groupe);
                const peutImporter =
                  gererGroupe || (monAnimateur && jour && estAffecteCeJour(groupe, jour));
                const progression = importEnCours[groupe];
                return (
                  <div
                    key={groupe}
                    className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
                  >
                    <h2 className="text-lg font-semibold text-zinc-900">
                      {GROUPE_LABELS[groupe]}
                    </h2>

                    {peutImporter && (
                      <div className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3">
                        <label className="text-xs font-medium text-zinc-600">
                          Importer toutes les photos des goûters d&apos;un coup
                          (l&apos;IA reconnaît chaque produit automatiquement)
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          disabled={!!progression}
                          onChange={(e) => {
                            importerPlusieursPhotos(groupe, e.target.files);
                            e.target.value = "";
                          }}
                          className="mt-1 block text-sm"
                        />
                        {progression && (
                          <p className="mt-1 text-xs text-zinc-500">
                            Importation {progression.fait}/{progression.total}...
                          </p>
                        )}
                      </div>
                    )}

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
                                  {g.type_produit || g.marque
                                    ? `${g.type_produit ?? "?"} · ${g.marque ?? "?"}`
                                    : "Nouveau produit"}
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

                            {(peutPhoto || g.nom_produit || g.numero_lot || g.date_peremption || g.quantite || g.type_produit || g.marque) && (
                              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <div>
                                  <label className="text-xs text-zinc-400">Type de produit</label>
                                  <input
                                    value={g.type_produit ?? ""}
                                    disabled={!peutPhoto}
                                    onChange={(e) => majChamp(g.id, "type_produit", e.target.value)}
                                    className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-50"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-zinc-400">Marque</label>
                                  <input
                                    value={g.marque ?? ""}
                                    disabled={!peutPhoto}
                                    onChange={(e) => majChamp(g.id, "marque", e.target.value)}
                                    className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-50"
                                  />
                                </div>
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
