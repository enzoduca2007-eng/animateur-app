"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { useVacances } from "@/lib/use-vacances";
import { estWeekend, joursDe, periodeEnCours } from "@/lib/vacances";
import { PeriodesVacances } from "@/components/periodes-vacances";
import {
  canManage,
  type AffectationJour,
  type Animateur,
  type EffectifJour,
  type EffectifSousGroupe,
  type Gouter,
  type GouterPrevu,
  type Groupe,
  type ProduitGouter,
  type SousGroupe,
} from "@/lib/types";

const STATUT_LABELS: Record<Gouter["statut_ia"], { texte: string; classe: string }> = {
  en_attente: { texte: "En attente de photo", classe: "bg-zinc-100 text-zinc-500" },
  traite: { texte: "Analysé par l'IA", classe: "bg-emerald-100 text-emerald-700" },
  echec: { texte: "Analyse IA échouée", classe: "bg-red-100 text-red-700" },
};

// Un "bloc" = une des 3 sections affichées (Lutins / Trolls / Géants).
// Le groupe réel (encadrement, effectifs officiels) reste lutins/trolls —
// sousGroupe n'est qu'un découpage d'affichage pour les Trolls, comme sur
// Activités et Répartition.
type Bloc = { groupe: Groupe; sousGroupe: SousGroupe | null };
type CodeBloc = "lutins" | SousGroupe;

const BLOCS: Bloc[] = [
  { groupe: "lutins", sousGroupe: null },
  { groupe: "trolls", sousGroupe: "trolls" },
  { groupe: "trolls", sousGroupe: "geants" },
];

const LABEL_BLOC: Record<CodeBloc, string> = {
  lutins: "Lutins",
  trolls: "Trolls",
  geants: "Géants",
};

function codeDeBloc(bloc: Bloc): CodeBloc {
  return bloc.groupe === "lutins" ? "lutins" : bloc.sousGroupe!;
}

function appartientAuBloc(
  item: { groupe: Groupe; sous_groupe: SousGroupe | null },
  bloc: Bloc
) {
  return item.groupe === bloc.groupe && (bloc.groupe === "lutins" || item.sous_groupe === bloc.sousGroupe);
}

function visibleDansBloc(
  item: { groupe: Groupe; sous_groupe: SousGroupe | null; commun_avec: CodeBloc[] },
  bloc: Bloc
) {
  return appartientAuBloc(item, bloc) || item.commun_avec.includes(codeDeBloc(bloc));
}

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

  function peutGererBloc(bloc: Bloc) {
    return peutGererGroupe(bloc.groupe);
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
  const [creationEnCours, setCreationEnCours] = useState<Record<string, boolean>>({});

  // Prévisionnel d'achats : catalogue (produits, avec quantité/personne et
  // taille de paquet directement dessus, plus de déclinaison par marque),
  // les produits prévus pour chaque (jour, bloc) — un même produit prévu
  // peut être partagé entre 2 ou 3 blocs via commun_avec — et les
  // effectifs/animateurs de la période pour en déduire la quantité à
  // acheter.
  const [produits, setProduits] = useState<ProduitGouter[]>([]);
  const [goutersPrevus, setGoutersPrevus] = useState<GouterPrevu[]>([]);
  const [effectifsPeriode, setEffectifsPeriode] = useState<EffectifJour[]>([]);
  const [effectifsSousGroupePeriode, setEffectifsSousGroupePeriode] = useState<EffectifSousGroupe[]>([]);
  const [affectationsJourPeriode, setAffectationsJourPeriode] = useState<AffectationJour[]>([]);
  const [formNouveauProduit, setFormNouveauProduit] = useState({
    nom: "",
    quantite_par_personne: "2",
    taille_paquet: "20",
  });
  const [ajoutsCellule, setAjoutsCellule] = useState<Record<string, string>>({});
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

  function estAffecteBlocCeJour(bloc: Bloc, date: string) {
    return mesAffectations.some((a) => a.date === date && appartientAuBloc(a, bloc));
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

  // Un animateur (sans droits de gestion) ne voit que le(s) bloc(s)
  // auxquels il est affecté ce jour-là via la Répartition.
  const blocsGeres = useMemo(() => {
    if (monGroupe) return BLOCS.filter((b) => b.groupe === monGroupe);
    if (profile.role !== "animateur") return BLOCS;
    if (!jour) return [];
    return BLOCS.filter((b) => estAffecteBlocCeJour(b, jour));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        .from("effectifs_sous_groupe")
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
    ]).then(([{ data: e }, { data: esg }, { data: aj }, { data: gp }]) => {
      setEffectifsPeriode((e as EffectifJour[]) ?? []);
      setEffectifsSousGroupePeriode((esg as EffectifSousGroupe[]) ?? []);
      setAffectationsJourPeriode((aj as AffectationJour[]) ?? []);
      setGoutersPrevus((gp as GouterPrevu[]) ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode, profile.role]);

  function nomProduit(produitId: string | null) {
    if (!produitId) return "—";
    return produits.find((p) => p.id === produitId)?.nom ?? "—";
  }

  // Effectif + animateurs affectés à CE bloc précis ce jour-là.
  function totalPersonnesDuBloc(bloc: Bloc, date: string) {
    if (bloc.groupe === "lutins") {
      const effectifEnfants = effectifsPeriode
        .filter((e) => e.date === date && e.groupe === "lutins")
        .reduce((s, e) => s + e.effectif, 0);
      const nbAnimateurs = new Set(
        affectationsJourPeriode
          .filter((a) => a.date === date && appartientAuBloc(a, bloc))
          .map((a) => a.animateur_id)
      ).size;
      return effectifEnfants + nbAnimateurs;
    }
    const effectifEnfants = effectifsSousGroupePeriode
      .filter((e) => e.date === date && e.sous_groupe === bloc.sousGroupe)
      .reduce((s, e) => s + e.effectif, 0);
    const nbAnimateurs = new Set(
      affectationsJourPeriode
        .filter((a) => a.date === date && appartientAuBloc(a, bloc))
        .map((a) => a.animateur_id)
    ).size;
    return effectifEnfants + nbAnimateurs;
  }

  function blocsDuPrevu(prevu: GouterPrevu): Bloc[] {
    const propre = BLOCS.find((b) => appartientAuBloc(prevu, b));
    const communs = BLOCS.filter((b) => prevu.commun_avec.includes(codeDeBloc(b)));
    const tous = propre ? [propre, ...communs] : communs;
    return tous.filter((b, i) => tous.findIndex((b2) => codeDeBloc(b2) === codeDeBloc(b)) === i);
  }

  function paquetsNecessaires(prevu: GouterPrevu, date: string) {
    const produit = produits.find((p) => p.id === prevu.produit_id);
    if (!produit) return { quantite: 0, paquets: 0 };
    const total =
      blocsDuPrevu(prevu).reduce((s, b) => s + totalPersonnesDuBloc(b, date), 0) *
      produit.quantite_par_personne;
    if (total === 0) return { quantite: 0, paquets: 0 };
    return { quantite: total, paquets: Math.ceil(total / produit.taille_paquet) + 1 };
  }

  function prevusDuBloc(bloc: Bloc, date: string) {
    return goutersPrevus.filter((g) => g.date === date && visibleDansBloc(g, bloc));
  }

  async function ajouterGouterPrevu(bloc: Bloc, date: string, produitId: string) {
    if (!produitId) return;
    setErreur(null);
    if (
      goutersPrevus.some(
        (g) => g.date === date && appartientAuBloc(g, bloc) && g.produit_id === produitId
      )
    )
      return;

    const optimisticId = `optimistic-${bloc.groupe}-${bloc.sousGroupe}-${date}-${produitId}`;
    setGoutersPrevus((prev) => [
      ...prev,
      {
        id: optimisticId,
        date,
        groupe: bloc.groupe,
        sous_groupe: bloc.sousGroupe,
        commun_avec: [],
        produit_id: produitId,
        created_by: profile.id,
        created_at: new Date().toISOString(),
      },
    ]);
    setAjoutsCellule((prev) => ({ ...prev, [`${date}|${codeDeBloc(bloc)}`]: "" }));

    const { data, error } = await supabase
      .from("gouters_prevus")
      .insert({
        date,
        groupe: bloc.groupe,
        sous_groupe: bloc.sousGroupe,
        produit_id: produitId,
        created_by: profile.id,
      })
      .select("*")
      .single();
    if (error) {
      setErreur(error.message);
      setGoutersPrevus((prev) => prev.filter((g) => g.id !== optimisticId));
    } else if (data) {
      setGoutersPrevus((prev) => prev.map((g) => (g.id === optimisticId ? (data as GouterPrevu) : g)));
    }
  }

  async function retirerGouterPrevu(id: string) {
    setErreur(null);
    setGoutersPrevus((prev) => prev.filter((g) => g.id !== id));
    if (!id.startsWith("optimistic-")) {
      const { error } = await supabase.from("gouters_prevus").delete().eq("id", id);
      if (error) setErreur(error.message);
    }
  }

  // Bascule ce prévisionnel comme partagé (ou non) avec un autre bloc —
  // purement indicatif sur la sélection du produit, chaque bloc reste
  // libre de photographier son propre emballage.
  async function basculerCommunAvec(prevu: GouterPrevu, code: CodeBloc) {
    const present = prevu.commun_avec.includes(code);
    const commun_avec = present
      ? prevu.commun_avec.filter((c) => c !== code)
      : [...prevu.commun_avec, code];
    setGoutersPrevus((prev) => prev.map((g) => (g.id === prevu.id ? { ...g, commun_avec } : g)));
    if (!prevu.id.startsWith("optimistic-")) {
      await supabase.from("gouters_prevus").update({ commun_avec }).eq("id", prevu.id);
    }
  }

  async function ajouterProduitGouter() {
    const nom = formNouveauProduit.nom.trim();
    const qte = Number(formNouveauProduit.quantite_par_personne);
    const taille = Number(formNouveauProduit.taille_paquet);
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
    setFormNouveauProduit({ nom: "", quantite_par_personne: "2", taille_paquet: "20" });
  }

  async function majProduit(id: string, updates: Partial<ProduitGouter>) {
    setProduits((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    await supabase.from("produits_gouter").update(updates).eq("id", id);
  }

  async function supprimerProduitGouter(id: string) {
    if (!confirm("Supprimer ce produit ? Il ne sera plus proposé dans le prévisionnel.")) return;
    setProduits((prev) => prev.filter((p) => p.id !== id));
    setGoutersPrevus((prev) => prev.filter((g) => g.produit_id !== id));
    await supabase.from("produits_gouter").delete().eq("id", id);
  }

  const goutersImprimables = useMemo(
    () =>
      goutersPeriode
        .filter((g) => !monGroupe || g.groupe === monGroupe)
        .sort((a, b) => (a.date + a.groupe + (a.sous_groupe ?? "")).localeCompare(b.date + b.groupe + (b.sous_groupe ?? ""))),
    [goutersPeriode, monGroupe]
  );

  // Prévisionnel d'achats agrégé pour l'impression : une ligne par produit,
  // en additionnant les blocs concernés par CHAQUE prévu distinct (pas de
  // double-comptage quand un prévu est partagé entre plusieurs blocs).
  const lignesImprimables = useMemo(() => {
    const parProduit = new Map<string, GouterPrevu[]>();
    for (const p of goutersPrevus) {
      if (!parProduit.has(p.produit_id)) parProduit.set(p.produit_id, []);
      parProduit.get(p.produit_id)!.push(p);
    }
    return Array.from(parProduit.entries())
      .map(([produitId, prevus]) => ({ produitId, prevus }))
      .filter(({ produitId }) => produits.some((p) => p.id === produitId))
      .sort((a, b) => nomProduit(a.produitId).localeCompare(nomProduit(b.produitId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goutersPrevus, produits]);

  async function trouverOuCreerGouter(bloc: Bloc, date: string, produitId: string | null) {
    const existant = gouters.find(
      (g) => g.date === date && appartientAuBloc(g, bloc) && g.produit_id === produitId
    );
    if (existant) return existant;
    const { data, error } = await supabase
      .from("gouters")
      .insert({
        date,
        groupe: bloc.groupe,
        sous_groupe: bloc.sousGroupe,
        produit_id: produitId,
        created_by: profile.id,
      })
      .select("*")
      .single();
    if (error || !data) {
      setErreur(error?.message ?? "Erreur lors de la création de la fiche.");
      return null;
    }
    const nouveau = data as Gouter;
    setGouters((prev) => [...prev, nouveau]);
    return nouveau;
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

  // Clic sur un produit prévu : crée (si besoin) la fiche de traçabilité
  // liée à ce produit pour ce bloc, puis envoie la photo choisie.
  async function photoPourPrevu(bloc: Bloc, date: string, produitId: string, file: File) {
    const cle = `${bloc.groupe}-${bloc.sousGroupe}-${produitId}`;
    setCreationEnCours((prev) => ({ ...prev, [cle]: true }));
    const gouter = await trouverOuCreerGouter(bloc, date, produitId);
    setCreationEnCours((prev) => ({ ...prev, [cle]: false }));
    if (gouter) await envoyerPhoto(gouter, file);
  }

  async function ajouterImprevu(bloc: Bloc, date: string, file: File) {
    const cle = `${bloc.groupe}-${bloc.sousGroupe}-imprevu`;
    setCreationEnCours((prev) => ({ ...prev, [cle]: true }));
    const gouter = await trouverOuCreerGouter(bloc, date, null);
    setCreationEnCours((prev) => ({ ...prev, [cle]: false }));
    if (gouter) await envoyerPhoto(gouter, file);
  }

  async function majChamp(
    id: string,
    champ: "nom_produit" | "numero_lot" | "date_peremption" | "quantite",
    valeur: string
  ) {
    setGouters((prev) => prev.map((g) => (g.id === id ? { ...g, [champ]: valeur || null } : g)));
    setGoutersPeriode((prev) => prev.map((g) => (g.id === id ? { ...g, [champ]: valeur || null } : g)));
    await supabase.from("gouters").update({ [champ]: valeur || null }).eq("id", id);
  }

  async function supprimerFiche(id: string) {
    if (!confirm("Supprimer cette fiche ?")) return;
    setGouters((prev) => prev.filter((g) => g.id !== id));
    await supabase.from("gouters").delete().eq("id", id);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print">
        <h1 className="text-2xl font-semibold text-zinc-900">Goûters</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Traçabilité alimentaire : clique sur un produit prévu pour
          photographier son emballage — l&apos;IA reconnaît automatiquement
          le nom, le numéro de lot, la DLC et la quantité. Tout reste
          corrigible à la main en cas d&apos;erreur de lecture.
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
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                    Prévisionnel d&apos;achats — {periode?.description}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-400">
                    Un même produit prévu peut être coché en commun pour 2 ou
                    3 blocs. Paquets = (effectif enfants + animateurs
                    affectés, additionnés sur les blocs concernés) × quantité/
                    personne, arrondi au paquet supérieur, + 1 de secours.
                  </p>
                </div>
                <button
                  onClick={() => window.print()}
                  className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Imprimer le tableau des quantités
                </button>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Catalogue
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <input
                    value={formNouveauProduit.nom}
                    onChange={(e) =>
                      setFormNouveauProduit((f) => ({ ...f, nom: e.target.value }))
                    }
                    placeholder="Nouveau produit (ex. Bichocos)"
                    className="w-48 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                  <div>
                    <label className="block text-[11px] text-zinc-400">Qté/pers.</label>
                    <input
                      type="number"
                      min={1}
                      value={formNouveauProduit.quantite_par_personne}
                      onChange={(e) =>
                        setFormNouveauProduit((f) => ({
                          ...f,
                          quantite_par_personne: e.target.value,
                        }))
                      }
                      className="w-16 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400">Taille paquet</label>
                    <input
                      type="number"
                      min={1}
                      value={formNouveauProduit.taille_paquet}
                      onChange={(e) =>
                        setFormNouveauProduit((f) => ({ ...f, taille_paquet: e.target.value }))
                      }
                      className="w-16 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <button
                    onClick={ajouterProduitGouter}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    + Ajouter le produit
                  </button>
                </div>

                {produits.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-400">
                    Aucun produit configuré pour l&apos;instant.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {produits.map((produit) => (
                      <div
                        key={produit.id}
                        className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                      >
                        <input
                          defaultValue={produit.nom}
                          onBlur={(e) =>
                            e.target.value.trim() &&
                            majProduit(produit.id, { nom: e.target.value.trim() })
                          }
                          className="w-40 rounded border border-transparent px-1 py-0.5 font-medium hover:border-zinc-200 focus:border-zinc-300 focus:outline-none"
                        />
                        <input
                          type="number"
                          min={1}
                          defaultValue={produit.quantite_par_personne}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (v > 0) majProduit(produit.id, { quantite_par_personne: v });
                          }}
                          className="w-10 rounded border border-transparent px-1 text-xs text-zinc-500 hover:border-zinc-200 focus:border-zinc-300 focus:outline-none"
                        />
                        <span className="text-xs text-zinc-400">/pers., paquet de</span>
                        <input
                          type="number"
                          min={1}
                          defaultValue={produit.taille_paquet}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (v > 0) majProduit(produit.id, { taille_paquet: v });
                          }}
                          className="w-12 rounded border border-transparent px-1 text-xs text-zinc-500 hover:border-zinc-200 focus:border-zinc-300 focus:outline-none"
                        />
                        <button
                          onClick={() => supprimerProduitGouter(produit.id)}
                          title="Supprimer ce produit"
                          className="ml-auto text-zinc-300 hover:text-red-600"
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
                    Goûter du jour par bloc — {periode?.description} (
                    {joursOuvrables.length} jours)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="border-collapse text-left text-sm">
                      <thead>
                        <tr>
                          <th className="sticky left-0 z-10 border border-zinc-300 bg-zinc-50 px-3 py-2 font-medium">
                            Bloc
                          </th>
                          {joursOuvrables.map((j) => (
                            <th
                              key={j}
                              className="border border-zinc-300 bg-zinc-50 px-2 py-2 text-center font-medium capitalize"
                            >
                              {formatJourCourt(j)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {BLOCS.map((bloc) => {
                          const code = codeDeBloc(bloc);
                          const autresBlocs = BLOCS.filter((b) => codeDeBloc(b) !== code);
                          return (
                            <tr key={code} className="border-b border-zinc-100 last:border-0">
                              <td className="sticky left-0 z-10 whitespace-nowrap border border-zinc-300 bg-white px-3 py-2 font-medium text-zinc-900">
                                {LABEL_BLOC[code]}
                              </td>
                              {joursOuvrables.map((j) => {
                                const cle = `${j}|${code}`;
                                const prevus = prevusDuBloc(bloc, j);
                                return (
                                  <td
                                    key={j}
                                    className="min-w-[170px] border border-zinc-300 px-1.5 py-1.5 align-top"
                                  >
                                    <div className="flex flex-col gap-1.5">
                                      {prevus.map((prevu) => {
                                        const { quantite, paquets } = paquetsNecessaires(prevu, j);
                                        const estEmprunt = !appartientAuBloc(prevu, bloc);
                                        return (
                                          <div
                                            key={prevu.id}
                                            className="rounded border border-zinc-200 px-1.5 py-1 text-[11px]"
                                          >
                                            <div className="flex items-start justify-between gap-1">
                                              <span className="font-medium text-zinc-700">
                                                {nomProduit(prevu.produit_id)}
                                              </span>
                                              {!estEmprunt && (
                                                <button
                                                  onClick={() => retirerGouterPrevu(prevu.id)}
                                                  className="shrink-0 text-zinc-300 hover:text-red-600"
                                                >
                                                  🗑
                                                </button>
                                              )}
                                            </div>
                                            {paquets > 0 ? (
                                              <p>
                                                <span className="font-semibold text-zinc-900">
                                                  {paquets} paquet{paquets > 1 ? "s" : ""}
                                                </span>{" "}
                                                <span className="text-zinc-400">({quantite}u)</span>
                                              </p>
                                            ) : (
                                              <p className="text-zinc-300">Effectif ?</p>
                                            )}
                                            {estEmprunt ? (
                                              <p className="mt-0.5 text-zinc-400">
                                                🤝 avec {LABEL_BLOC[codeDeBloc(BLOCS.find((b) => appartientAuBloc(prevu, b))!)]}
                                              </p>
                                            ) : (
                                              <div className="mt-1 flex flex-wrap gap-1.5">
                                                {autresBlocs.map((autre) => {
                                                  const autreCode = codeDeBloc(autre);
                                                  return (
                                                    <label
                                                      key={autreCode}
                                                      className="flex items-center gap-0.5 text-zinc-400"
                                                    >
                                                      <input
                                                        type="checkbox"
                                                        checked={prevu.commun_avec.includes(autreCode)}
                                                        onChange={() => basculerCommunAvec(prevu, autreCode)}
                                                        className="h-2.5 w-2.5"
                                                      />
                                                      {LABEL_BLOC[autreCode]}
                                                    </label>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>

                                    <div className="mt-1.5 flex items-center gap-1">
                                      <select
                                        value={ajoutsCellule[cle] ?? ""}
                                        onChange={(e) =>
                                          setAjoutsCellule((prev) => ({
                                            ...prev,
                                            [cle]: e.target.value,
                                          }))
                                        }
                                        className="w-full rounded-md border border-zinc-300 px-1 py-1 text-xs"
                                      >
                                        <option value="">+ Choisir...</option>
                                        {produits.map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.nom}
                                          </option>
                                        ))}
                                      </select>
                                      <button
                                        onClick={() => ajouterGouterPrevu(bloc, j, ajoutsCellule[cle] ?? "")}
                                        title="Ajouter ce goûter"
                                        className="shrink-0 rounded-md border border-zinc-300 px-1.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {canManage(profile.role) && lignesImprimables.length > 0 && (
            <div className="hidden print:block">
              <h2 className="text-lg font-bold text-zinc-900">
                Prévisionnel d&apos;achats de goûters
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                {periode?.description} ({periode?.debut} – {periode?.fin}) · Zone {zone}
              </p>
              <table className="mt-4 w-full border-collapse text-left text-xs">
                <thead>
                  <tr>
                    <th className="border border-black px-2 py-1 font-semibold">Produit</th>
                    {joursOuvrables.map((j) => (
                      <th
                        key={j}
                        className="border border-black px-2 py-1 text-center font-semibold capitalize"
                      >
                        {formatJourCourt(j)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lignesImprimables.map(({ produitId, prevus }) => (
                    <tr key={produitId}>
                      <td className="border border-black px-2 py-1 font-semibold">
                        {nomProduit(produitId)}
                      </td>
                      {joursOuvrables.map((j) => {
                        const prevusDuJour = prevus.filter((p) => p.date === j);
                        if (prevusDuJour.length === 0) {
                          return (
                            <td
                              key={j}
                              className="border border-black px-2 py-1 text-center text-zinc-300"
                            >
                              —
                            </td>
                          );
                        }
                        const totalPaquets = prevusDuJour.reduce(
                          (s, p) => s + paquetsNecessaires(p, j).paquets,
                          0
                        );
                        const totalQuantite = prevusDuJour.reduce(
                          (s, p) => s + paquetsNecessaires(p, j).quantite,
                          0
                        );
                        return (
                          <td key={j} className="border border-black px-2 py-1 text-center">
                            <span className="font-semibold">
                              {totalPaquets} paquet{totalPaquets > 1 ? "s" : ""}
                            </span>
                            <br />
                            <span className="text-zinc-500">({totalQuantite}u)</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canManage(profile.role) && (
            <div className="hidden print:block">
              <h2 className="text-lg font-bold text-zinc-900">
                Traçabilité des goûters
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                {periode?.description} ({periode?.debut} – {periode?.fin}) · Zone {zone}
              </p>
              <table className="mt-4 w-full border-collapse text-left text-xs">
                <thead>
                  <tr>
                    <th className="border border-black px-2 py-1 font-semibold capitalize">
                      Date
                    </th>
                    <th className="border border-black px-2 py-1 font-semibold">Bloc</th>
                    <th className="border border-black px-2 py-1 font-semibold">Produit</th>
                    <th className="border border-black px-2 py-1 font-semibold">Photo</th>
                    <th className="border border-black px-2 py-1 font-semibold">
                      Nom produit (IA)
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
                        colSpan={8}
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
                          {LABEL_BLOC[g.groupe === "lutins" ? "lutins" : g.sous_groupe ?? "trolls"]}
                        </td>
                        <td className="border border-black px-2 py-1">{nomProduit(g.produit_id)}</td>
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
          ) : blocsGeres.length === 0 ? (
            <p className="no-print text-sm text-zinc-400">
              Tu n&apos;es affecté à aucun groupe ce jour-là.
            </p>
          ) : (
            <div className="no-print flex flex-col gap-5">
              {blocsGeres.map((bloc) => {
                const code = codeDeBloc(bloc);
                const gererBloc = peutGererBloc(bloc);
                const peutPhoto = gererBloc || (monAnimateur && jour && estAffecteBlocCeJour(bloc, jour));
                const prevus = jour ? prevusDuBloc(bloc, jour) : [];
                const imprevus = jour
                  ? gouters.filter((g) => appartientAuBloc(g, bloc) && g.produit_id === null)
                  : [];
                const cleImprevu = `${bloc.groupe}-${bloc.sousGroupe}-imprevu`;

                return (
                  <div
                    key={code}
                    className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
                  >
                    <h2 className="text-lg font-semibold text-zinc-900">{LABEL_BLOC[code]}</h2>

                    <div className="mt-3 flex flex-col gap-4">
                      {prevus.length === 0 && (
                        <p className="text-sm text-zinc-400">
                          Aucun produit prévu pour ce jour.
                          {gererBloc && " Ajoute-le dans le prévisionnel plus haut."}
                        </p>
                      )}
                      {prevus.map((prevu) => {
                        const fiche = jour
                          ? gouters.find(
                              (g) =>
                                g.date === jour &&
                                appartientAuBloc(g, bloc) &&
                                g.produit_id === prevu.produit_id
                            )
                          : undefined;
                        const cle = `${bloc.groupe}-${bloc.sousGroupe}-${prevu.produit_id}`;
                        const enCours = creationEnCours[cle] || (fiche ? envoiEnCours[fiche.id] : false);
                        const statut = fiche ? STATUT_LABELS[fiche.statut_ia] : null;

                        return (
                          <div key={prevu.id} className="rounded-lg border border-zinc-200 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-medium text-zinc-900">{nomProduit(prevu.produit_id)}</p>
                                {statut ? (
                                  <span
                                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${statut.classe}`}
                                  >
                                    {statut.texte}
                                  </span>
                                ) : (
                                  <span className="mt-1 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                                    Pas encore photographié
                                  </span>
                                )}
                                {fiche?.statut_ia === "echec" && fiche.erreur_ia && (
                                  <p className="mt-1 text-xs text-red-600">{fiche.erreur_ia}</p>
                                )}
                              </div>
                              {fiche && gererBloc && (
                                <button
                                  onClick={() => supprimerFiche(fiche.id)}
                                  className="text-xs text-red-500 hover:text-red-700"
                                >
                                  Supprimer la fiche
                                </button>
                              )}
                            </div>

                            {fiche?.photo_url && (
                              <a href={fiche.photo_url} target="_blank" rel="noreferrer" className="mt-3 block">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={fiche.photo_url}
                                  alt="Emballage du produit"
                                  className="h-24 w-24 rounded-md border border-zinc-200 object-cover"
                                />
                              </a>
                            )}

                            {peutPhoto && jour && (
                              <div className="mt-3">
                                <label className="text-xs font-medium text-zinc-500">
                                  {fiche?.photo_url ? "Remplacer la photo" : "📷 Cliquer pour photographier"}
                                </label>
                                <input
                                  type="file"
                                  accept="image/*"
                                  disabled={!!enCours}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) photoPourPrevu(bloc, jour, prevu.produit_id, file);
                                    e.target.value = "";
                                  }}
                                  className="mt-1 block text-sm"
                                />
                                {enCours && (
                                  <p className="mt-1 text-xs text-zinc-400">Envoi et analyse en cours...</p>
                                )}
                              </div>
                            )}

                            {fiche && (fiche.nom_produit || fiche.numero_lot || fiche.date_peremption || fiche.quantite || peutPhoto) && (
                              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <div>
                                  <label className="text-xs text-zinc-400">Nom produit</label>
                                  <input
                                    value={fiche.nom_produit ?? ""}
                                    disabled={!peutPhoto}
                                    onChange={(e) => majChamp(fiche.id, "nom_produit", e.target.value)}
                                    className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-50"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-zinc-400">N° de lot</label>
                                  <input
                                    value={fiche.numero_lot ?? ""}
                                    disabled={!peutPhoto}
                                    onChange={(e) => majChamp(fiche.id, "numero_lot", e.target.value)}
                                    className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-50"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-zinc-400">DLC/DLUO</label>
                                  <input
                                    type="date"
                                    value={fiche.date_peremption ?? ""}
                                    disabled={!peutPhoto}
                                    onChange={(e) => majChamp(fiche.id, "date_peremption", e.target.value)}
                                    className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-50"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-zinc-400">Quantité</label>
                                  <input
                                    value={fiche.quantite ?? ""}
                                    disabled={!peutPhoto}
                                    onChange={(e) => majChamp(fiche.id, "quantite", e.target.value)}
                                    className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-50"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {imprevus.map((g) => {
                        const statut = STATUT_LABELS[g.statut_ia];
                        return (
                          <div key={g.id} className="rounded-lg border border-dashed border-zinc-300 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-medium text-zinc-900">Produit imprévu</p>
                                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${statut.classe}`}>
                                  {statut.texte}
                                </span>
                              </div>
                              {peutPhoto && (
                                <button
                                  onClick={() => supprimerFiche(g.id)}
                                  className="text-xs text-red-500 hover:text-red-700"
                                >
                                  Supprimer
                                </button>
                              )}
                            </div>
                            {g.photo_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={g.photo_url}
                                alt="Emballage du produit"
                                className="mt-3 h-24 w-24 rounded-md border border-zinc-200 object-cover"
                              />
                            )}
                            {(g.nom_produit || g.numero_lot || g.date_peremption || g.quantite) && (
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

                    {peutPhoto && jour && (
                      <div className="mt-4 border-t border-zinc-100 pt-4">
                        <label className="text-xs font-medium text-zinc-500">
                          + Photo d&apos;un produit imprévu (non planifié)
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={!!creationEnCours[cleImprevu]}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) ajouterImprevu(bloc, jour, file);
                            e.target.value = "";
                          }}
                          className="mt-1 block text-sm"
                        />
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
