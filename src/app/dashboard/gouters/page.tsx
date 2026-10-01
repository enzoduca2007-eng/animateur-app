"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { useVacances } from "@/lib/use-vacances";
import { estWeekend, joursDe, periodeEnCours, semainesDe } from "@/lib/vacances";
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

const FORMAT_EUR = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

const JOURS_SEMAINE = [
  { numero: 1, label: "Lundi" },
  { numero: 2, label: "Mardi" },
  { numero: 3, label: "Mercredi" },
  { numero: 4, label: "Jeudi" },
  { numero: 5, label: "Vendredi" },
];

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
  const [affectationsPeriode, setAffectationsPeriode] = useState<AffectationJour[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState<Record<string, boolean>>({});
  const [creationEnCours, setCreationEnCours] = useState<Record<string, boolean>>({});

  // Prévisionnel : catalogue de produits (juste un nom) et les produits
  // prévus pour chaque (jour, bloc) — un même produit prévu peut être
  // partagé entre 2 ou 3 blocs via commun_avec, auquel cas les cellules du
  // tableau se fusionnent visuellement.
  const [produits, setProduits] = useState<ProduitGouter[]>([]);
  const [goutersPrevus, setGoutersPrevus] = useState<GouterPrevu[]>([]);
  const [effectifsJour, setEffectifsJour] = useState<EffectifJour[]>([]);
  const [effectifsSousGroupe, setEffectifsSousGroupe] = useState<EffectifSousGroupe[]>([]);
  const [formNouveauProduit, setFormNouveauProduit] = useState({
    nom: "",
    marque: "",
    lien: "",
    quantite_lutins: "1",
    quantite_trolls: "1",
    quantite_geants: "1",
    quantite_animateur: "1",
    taille_paquet: "20",
    prix_paquet: "",
    tracabilite_requise: true,
  });
  const [ajoutsCellule, setAjoutsCellule] = useState<Record<string, string>>({});
  const compteurUpload = useRef(0);
  const [modeImpression, setModeImpression] = useState<"menu" | "prix" | "grille" | "tracabilite">(
    "menu"
  );

  function imprimer(mode: "menu" | "prix" | "grille" | "tracabilite") {
    setModeImpression(mode);
    setTimeout(() => window.print(), 50);
  }

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
  const semaines = useMemo(() => semainesDe(joursOuvrables), [joursOuvrables]);

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
    supabase
      .from("gouters_prevus")
      .select("*")
      .gte("date", periode.debut)
      .lte("date", periode.fin)
      .then(({ data: gp }) => setGoutersPrevus((gp as GouterPrevu[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode, profile.role]);

  // Effectifs de la période, pour calculer automatiquement le nombre de
  // paquets à acheter et le coût de chaque produit prévu (cf. Répartition,
  // qui est la page où ces effectifs sont saisis).
  useEffect(() => {
    if (!periode || !canManage(profile.role)) return;
    supabase
      .from("effectifs_jour")
      .select("*")
      .gte("date", periode.debut)
      .lte("date", periode.fin)
      .then(({ data }) => setEffectifsJour((data as EffectifJour[]) ?? []));
    supabase
      .from("effectifs_sous_groupe")
      .select("*")
      .gte("date", periode.debut)
      .lte("date", periode.fin)
      .then(({ data }) => setEffectifsSousGroupe((data as EffectifSousGroupe[]) ?? []));
    // Les animateurs mangent aussi le goûter : on les compte en plus des
    // enfants dans le besoin (cf. Répartition, où ces affectations/jour
    // sont saisies).
    supabase
      .from("affectations_jour")
      .select("*")
      .gte("date", periode.debut)
      .lte("date", periode.fin)
      .then(({ data }) => setAffectationsPeriode((data as AffectationJour[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode, profile.role]);

  function effectifDuBloc(bloc: Bloc, date: string) {
    if (bloc.groupe === "lutins") {
      return effectifsJour.find((e) => e.groupe === "lutins" && e.date === date)?.effectif ?? 0;
    }
    return (
      effectifsSousGroupe.find((e) => e.sous_groupe === bloc.sousGroupe && e.date === date)
        ?.effectif ?? 0
    );
  }

  function effectifDuCode(code: CodeBloc, date: string) {
    const bloc = BLOCS.find((b) => codeDeBloc(b) === code);
    return bloc ? effectifDuBloc(bloc, date) : 0;
  }

  // Les animateurs affectés à un bloc ce jour-là (Répartition) mangent eux
  // aussi le goûter : comptés en plus des enfants dans le besoin.
  function animateursDuCode(code: CodeBloc, date: string) {
    const bloc = BLOCS.find((b) => codeDeBloc(b) === code);
    if (!bloc) return 0;
    return affectationsPeriode.filter((a) => a.date === date && appartientAuBloc(a, bloc)).length;
  }

  function nomProduit(produitId: string | null) {
    if (!produitId) return "—";
    return produits.find((p) => p.id === produitId)?.nom ?? "—";
  }

  // La quantité/enfant d'un produit dépend du bloc (un Géant mange plus
  // qu'un Lutin), d'où le besoin d'un lookup par code plutôt qu'une seule
  // valeur sur le produit.
  function quantiteParGroupe(produit: ProduitGouter, code: CodeBloc) {
    if (code === "lutins") return produit.quantite_lutins;
    if (code === "trolls") return produit.quantite_trolls;
    return produit.quantite_geants;
  }

  // Nombre de paquets à acheter et coût pour un produit prévu : à partir
  // des effectifs + animateurs du/des bloc(s) concernés (bloc natif +
  // commun_avec) ce jour-là — les enfants pondérés par la quantité/enfant
  // de leur groupe, les animateurs par la quantité/animateur du produit
  // (portion différente, pas forcément celle d'un groupe d'enfants) —
  // puis taille de paquet + prix du produit.
  function besoinPrevu(prevu: GouterPrevu) {
    const produit = produits.find((p) => p.id === prevu.produit_id);
    if (!produit) return null;
    const codeNatif: CodeBloc = prevu.groupe === "lutins" ? "lutins" : (prevu.sous_groupe ?? "trolls");
    const codes: CodeBloc[] = [codeNatif, ...prevu.commun_avec];
    const enfants = codes.reduce((total, code) => total + effectifDuCode(code, prevu.date), 0);
    const animateurs = codes.reduce((total, code) => total + animateursDuCode(code, prevu.date), 0);
    const quantiteTotale = codes.reduce(
      (total, code) =>
        total +
        effectifDuCode(code, prevu.date) * quantiteParGroupe(produit, code) +
        animateursDuCode(code, prevu.date) * produit.quantite_animateur,
      0
    );
    const paquets = Math.ceil(quantiteTotale / produit.taille_paquet);
    const cout = paquets * produit.prix_paquet;
    return { enfants, animateurs, paquets, cout };
  }

  function prevusDuBloc(bloc: Bloc, date: string) {
    return goutersPrevus.filter((g) => g.date === date && visibleDansBloc(g, bloc));
  }

  // Regroupe les 3 blocs (Lutins/Trolls/Géants) contigus qui partagent
  // exactement le même ensemble de produits prévus ce jour-là, pour
  // fusionner leurs cellules dans le tableau (colSpan).
  function groupesDuJour(date: string) {
    const groupes: { blocs: Bloc[]; prevus: GouterPrevu[]; cle: string }[] = [];
    for (const bloc of BLOCS) {
      const prevus = prevusDuBloc(bloc, date);
      const cle = prevus.map((p) => p.id).sort().join(",");
      const dernier = groupes[groupes.length - 1];
      if (dernier && cle !== "" && dernier.cle === cle) {
        dernier.blocs.push(bloc);
      } else {
        groupes.push({ blocs: [bloc], prevus, cle });
      }
    }
    return groupes;
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
    if (!nom) return;
    setErreur(null);
    const { data, error } = await supabase
      .from("produits_gouter")
      .insert({
        nom,
        marque: formNouveauProduit.marque.trim() || null,
        lien: formNouveauProduit.lien.trim() || null,
        quantite_lutins: Number(formNouveauProduit.quantite_lutins) || 1,
        quantite_trolls: Number(formNouveauProduit.quantite_trolls) || 1,
        quantite_geants: Number(formNouveauProduit.quantite_geants) || 1,
        quantite_animateur: Number(formNouveauProduit.quantite_animateur) || 1,
        taille_paquet: Number(formNouveauProduit.taille_paquet) || 20,
        prix_paquet: Number(formNouveauProduit.prix_paquet) || 0,
        tracabilite_requise: formNouveauProduit.tracabilite_requise,
        created_by: profile.id,
      })
      .select()
      .single();
    if (error) {
      setErreur(error.message);
      return;
    }
    setProduits((prev) => [...prev, data as ProduitGouter].sort((a, b) => a.nom.localeCompare(b.nom)));
    setFormNouveauProduit({
      nom: "",
      marque: "",
      lien: "",
      quantite_lutins: "1",
      quantite_trolls: "1",
      quantite_geants: "1",
      quantite_animateur: "1",
      taille_paquet: "20",
      prix_paquet: "",
      tracabilite_requise: true,
    });
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
        .filter((g) => {
          const produit = produits.find((p) => p.id === g.produit_id);
          return !produit || produit.tracabilite_requise;
        })
        .sort((a, b) => (a.date + a.groupe + (a.sous_groupe ?? "")).localeCompare(b.date + b.groupe + (b.sous_groupe ?? ""))),
    [goutersPeriode, monGroupe, produits]
  );

  const coutTotalPeriode = useMemo(
    () => goutersPrevus.reduce((total, prevu) => total + (besoinPrevu(prevu)?.cout ?? 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goutersPrevus, produits, effectifsJour, effectifsSousGroupe, affectationsPeriode]
  );

  // Lignes du tableau imprimable "Quantités & prix", triées par jour, avec
  // le rowSpan de la colonne Jour pré-calculé pour fusionner les lignes
  // d'un même jour au lieu de répéter la date sur chacune.
  const lignesPrix = useMemo(() => {
    const lignes = [...goutersPrevus]
      .sort((a, b) =>
        (a.date + a.groupe + (a.sous_groupe ?? "")).localeCompare(b.date + b.groupe + (b.sous_groupe ?? ""))
      )
      .map((prevu) => {
        const produit = produits.find((p) => p.id === prevu.produit_id);
        const besoin = besoinPrevu(prevu);
        if (!produit || !besoin) return null;
        const codeNatif: CodeBloc = prevu.groupe === "lutins" ? "lutins" : (prevu.sous_groupe ?? "trolls");
        const codes: CodeBloc[] = [codeNatif, ...prevu.commun_avec];
        return { prevu, produit, besoin, codes };
      })
      .filter((ligne): ligne is NonNullable<typeof ligne> => ligne !== null);
    return lignes.map((ligne, i) => {
      const totalJour = lignes
        .filter((l) => l.prevu.date === ligne.prevu.date)
        .reduce((total, l) => total + l.besoin.cout, 0);
      // Prix/tête = coût du jour (anims compris) / enfants du jour
      // uniquement — effectif réel de chaque bloc une seule fois, pas
      // sommé par occurrence (sinon un même enfant compterait 2 fois s'il
      // a 2 produits prévus le même jour).
      const enfantsJour = BLOCS.reduce(
        (total, bloc) => total + effectifDuBloc(bloc, ligne.prevu.date),
        0
      );
      return {
        ...ligne,
        premiereDuJour: i === 0 || lignes[i - 1].prevu.date !== ligne.prevu.date,
        rowSpanJour: lignes.filter((l) => l.prevu.date === ligne.prevu.date).length,
        totalJour,
        prixParTete: enfantsJour > 0 ? totalJour / enfantsJour : null,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goutersPrevus, produits, effectifsJour, effectifsSousGroupe, affectationsPeriode]);

  // Produits utilisés dans la période (pour les lignes de la grille
  // imprimable), et paquets par (produit, jour, groupe) — calculés
  // indépendamment par bloc (pas mutualisés comme dans "Quantités & prix")
  // puisque la grille sert à la distribution : un produit commun à Trolls +
  // Géants donne 2 valeurs séparées, chacune arrondie à son propre paquet
  // entier.
  const produitsUtilises = useMemo(() => {
    const idsUtilises = new Set(goutersPrevus.map((g) => g.produit_id));
    return produits.filter((p) => idsUtilises.has(p.id));
  }, [goutersPrevus, produits]);

  const grillePaquetsParGroupe = useMemo(() => {
    const map = new Map<string, number>();
    for (const prevu of goutersPrevus) {
      const produit = produits.find((p) => p.id === prevu.produit_id);
      if (!produit) continue;
      const codeNatif: CodeBloc = prevu.groupe === "lutins" ? "lutins" : (prevu.sous_groupe ?? "trolls");
      const codes: CodeBloc[] = [codeNatif, ...prevu.commun_avec];
      for (const code of codes) {
        const enfants = effectifDuCode(code, prevu.date);
        const animateurs = animateursDuCode(code, prevu.date);
        const quantite = enfants * quantiteParGroupe(produit, code) + animateurs * produit.quantite_animateur;
        const paquets = Math.ceil(quantite / produit.taille_paquet);
        const cle = `${produit.id}|${prevu.date}|${code}`;
        map.set(cle, (map.get(cle) ?? 0) + paquets);
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goutersPrevus, produits, effectifsJour, effectifsSousGroupe, affectationsPeriode]);

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
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => imprimer("menu")}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Imprimer le tableau des goûters
                </button>
                <button
                  onClick={() => imprimer("prix")}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Imprimer quantités & prix
                </button>
                <button
                  onClick={() => imprimer("grille")}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Imprimer la grille produits/jours
                </button>
                <button
                  onClick={() => imprimer("tracabilite")}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Imprimer le tableau de traçabilité
                </button>
              </div>
            )}
          </div>

          {canManage(profile.role) && (
            <div className="no-print flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  Prévisionnel — {periode?.description}
                </h2>
                <p className="mt-1 text-xs text-zinc-400">
                  Un même produit prévu peut être coché en commun pour 2 ou 3
                  blocs (Lutins/Trolls/Géants) : les cellules du tableau se
                  fusionnent alors.
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Catalogue
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-400">Nom</label>
                    <input
                      value={formNouveauProduit.nom}
                      onChange={(e) =>
                        setFormNouveauProduit((prev) => ({ ...prev, nom: e.target.value }))
                      }
                      placeholder="Ex. Bichocos"
                      className="block w-36 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400">Marque</label>
                    <input
                      value={formNouveauProduit.marque}
                      onChange={(e) =>
                        setFormNouveauProduit((prev) => ({ ...prev, marque: e.target.value }))
                      }
                      placeholder="Ex. LU"
                      className="block w-28 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400">Lien d&apos;achat</label>
                    <input
                      value={formNouveauProduit.lien}
                      onChange={(e) =>
                        setFormNouveauProduit((prev) => ({ ...prev, lien: e.target.value }))
                      }
                      placeholder="https://..."
                      className="block w-36 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400">Qté/enfant (L · T · G · Anim)</label>
                    <div className="flex gap-1">
                      {(
                        [
                          ["quantite_lutins", "L", "Lutins"],
                          ["quantite_trolls", "T", "Trolls"],
                          ["quantite_geants", "G", "Géants"],
                          ["quantite_animateur", "A", "Animateur"],
                        ] as const
                      ).map(([champ, label, titre]) => (
                        <input
                          key={champ}
                          type="number"
                          min={1}
                          title={titre}
                          placeholder={label}
                          value={formNouveauProduit[champ]}
                          onChange={(e) =>
                            setFormNouveauProduit((prev) => ({ ...prev, [champ]: e.target.value }))
                          }
                          className="block w-10 rounded-md border border-zinc-300 px-1 py-1.5 text-center text-sm"
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400">Unités/paquet</label>
                    <input
                      type="number"
                      min={1}
                      value={formNouveauProduit.taille_paquet}
                      onChange={(e) =>
                        setFormNouveauProduit((prev) => ({ ...prev, taille_paquet: e.target.value }))
                      }
                      className="block w-20 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400">Prix/paquet (€)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={formNouveauProduit.prix_paquet}
                      onChange={(e) =>
                        setFormNouveauProduit((prev) => ({ ...prev, prix_paquet: e.target.value }))
                      }
                      placeholder="0,00"
                      className="block w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 pb-1.5 text-xs text-zinc-500">
                    <input
                      type="checkbox"
                      checked={formNouveauProduit.tracabilite_requise}
                      onChange={(e) =>
                        setFormNouveauProduit((prev) => ({
                          ...prev,
                          tracabilite_requise: e.target.checked,
                        }))
                      }
                    />
                    Traçabilité requise
                  </label>
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
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                      >
                        <input
                          defaultValue={produit.nom}
                          onBlur={(e) =>
                            e.target.value.trim() &&
                            majProduit(produit.id, { nom: e.target.value.trim() })
                          }
                          className="w-28 rounded border border-transparent px-1 py-0.5 font-medium hover:border-zinc-200 focus:border-zinc-300 focus:outline-none"
                        />
                        <input
                          defaultValue={produit.marque ?? ""}
                          onBlur={(e) => majProduit(produit.id, { marque: e.target.value.trim() || null })}
                          placeholder="Marque"
                          className="w-20 rounded border border-transparent px-1 py-0.5 text-zinc-500 hover:border-zinc-200 focus:border-zinc-300 focus:outline-none"
                        />
                        <input
                          defaultValue={produit.lien ?? ""}
                          onBlur={(e) => majProduit(produit.id, { lien: e.target.value.trim() || null })}
                          placeholder="Lien d'achat"
                          className="w-28 rounded border border-transparent px-1 py-0.5 text-zinc-500 hover:border-zinc-200 focus:border-zinc-300 focus:outline-none"
                        />
                        {produit.lien && (
                          <a
                            href={produit.lien}
                            target="_blank"
                            rel="noreferrer"
                            title={produit.lien}
                            className="text-zinc-400 hover:text-blue-600"
                          >
                            🔗
                          </a>
                        )}
                        <div className="flex items-center gap-1 text-xs text-zinc-400">
                          {(
                            [
                              ["quantite_lutins", "L", "Lutins"],
                              ["quantite_trolls", "T", "Trolls"],
                              ["quantite_geants", "G", "Géants"],
                              ["quantite_animateur", "A", "Animateur"],
                            ] as const
                          ).map(([champ, label, titre]) => (
                            <label key={champ} title={titre} className="flex items-center gap-0.5">
                              {label}
                              <input
                                type="number"
                                min={1}
                                defaultValue={produit[champ]}
                                onBlur={(e) => {
                                  const v = Number(e.target.value);
                                  if (v > 0) majProduit(produit.id, { [champ]: v });
                                }}
                                className="w-10 rounded border border-zinc-200 px-1 py-0.5 text-center text-zinc-700"
                              />
                            </label>
                          ))}
                        </div>
                        <label className="flex items-center gap-1 text-xs text-zinc-400">
                          <input
                            type="number"
                            min={1}
                            defaultValue={produit.taille_paquet}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v > 0) majProduit(produit.id, { taille_paquet: v });
                            }}
                            className="w-14 rounded border border-zinc-200 px-1 py-0.5 text-zinc-700"
                          />
                          /paquet
                        </label>
                        <label className="flex items-center gap-1 text-xs text-zinc-400">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            defaultValue={produit.prix_paquet}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v >= 0) majProduit(produit.id, { prix_paquet: v });
                            }}
                            className="w-16 rounded border border-zinc-200 px-1 py-0.5 text-zinc-700"
                          />
                          €/paquet
                        </label>
                        <label className="flex items-center gap-1 text-xs text-zinc-500">
                          <input
                            type="checkbox"
                            checked={produit.tracabilite_requise}
                            onChange={(e) =>
                              majProduit(produit.id, { tracabilite_requise: e.target.checked })
                            }
                          />
                          Traçabilité
                        </label>
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
                    Goûters de la période — {periode?.description}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed border-collapse text-left text-sm">
                      <thead>
                        <tr>
                          {JOURS_SEMAINE.map((j) => (
                            <th
                              key={j.numero}
                              className="w-1/5 border border-zinc-300 bg-zinc-50 px-2 py-2 text-center font-medium"
                            >
                              {j.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {semaines.map((semaine) => (
                          <tr key={semaine[0]} className="border-b border-zinc-100 last:border-0">
                            {JOURS_SEMAINE.map(({ numero }) => {
                              const date = semaine.find(
                                (d) => new Date(`${d}T00:00:00Z`).getUTCDay() === numero
                              );
                              if (!date) {
                                return (
                                  <td
                                    key={numero}
                                    className="border border-zinc-200 bg-zinc-50/50 px-1.5 py-1.5"
                                  />
                                );
                              }
                              return (
                                <td key={numero} className="align-top border border-zinc-300 px-1.5 py-1.5">
                                  <p className="mb-1 text-[11px] font-medium capitalize text-zinc-400">
                                    {formatJourCourt(date)}
                                  </p>
                                  <div className="flex gap-1">
                                    {groupesDuJour(date).map((groupe) => {
                                      const codesGroupe = groupe.blocs.map(codeDeBloc);
                                      const autresBlocs = BLOCS.filter(
                                        (b) => !codesGroupe.includes(codeDeBloc(b))
                                      );
                                      const cle = `${date}|${codesGroupe.join("+")}`;
                                      return (
                                        <div
                                          key={codesGroupe.join("+")}
                                          className="min-w-0 flex-1 rounded border border-zinc-200 p-1"
                                        >
                                          <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                                            {groupe.blocs.map((b) => LABEL_BLOC[codeDeBloc(b)]).join(" + ")}
                                          </p>
                                          <div className="mt-1 flex flex-col gap-1">
                                            {groupe.prevus.map((prevu) => {
                                              const besoin = besoinPrevu(prevu);
                                              return (
                                                <div
                                                key={prevu.id}
                                                className="rounded bg-zinc-50 px-1 py-0.5 text-[11px]"
                                              >
                                                <div className="flex items-start justify-between gap-1">
                                                  <span className="font-medium text-zinc-700">
                                                    {nomProduit(prevu.produit_id)}
                                                    {produits.find((p) => p.id === prevu.produit_id)?.lien && (
                                                      <a
                                                        href={produits.find((p) => p.id === prevu.produit_id)!.lien!}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="ml-1 text-zinc-400 hover:text-blue-600"
                                                      >
                                                        🔗
                                                      </a>
                                                    )}
                                                  </span>
                                                  <button
                                                    onClick={() => retirerGouterPrevu(prevu.id)}
                                                    className="shrink-0 text-zinc-300 hover:text-red-600"
                                                  >
                                                    🗑
                                                  </button>
                                                </div>
                                                {besoin && (
                                                  <p className="text-[10px] text-zinc-400">
                                                    {besoin.enfants} enfants
                                                    {besoin.animateurs > 0 ? ` + ${besoin.animateurs} anim${besoin.animateurs > 1 ? "s" : ""}` : ""} ·{" "}
                                                    {besoin.paquets} paquet
                                                    {besoin.paquets > 1 ? "s" : ""} ·{" "}
                                                    {FORMAT_EUR.format(besoin.cout)}
                                                  </p>
                                                )}
                                                {autresBlocs.length > 0 && (
                                                  <div className="mt-0.5 flex flex-wrap gap-1 text-zinc-400">
                                                    {autresBlocs.map((autre) => {
                                                      const autreCode = codeDeBloc(autre);
                                                      return (
                                                        <label
                                                          key={autreCode}
                                                          className="flex items-center gap-0.5"
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

                                          <div className="mt-1 flex items-center gap-0.5">
                                            <select
                                              value={ajoutsCellule[cle] ?? ""}
                                              onChange={(e) =>
                                                setAjoutsCellule((prev) => ({
                                                  ...prev,
                                                  [cle]: e.target.value,
                                                }))
                                              }
                                              className="w-full min-w-0 rounded border border-zinc-300 px-0.5 py-0.5 text-[10px]"
                                            >
                                              <option value="">+ ...</option>
                                              {produits.map((p) => (
                                                <option key={p.id} value={p.id}>
                                                  {p.nom}
                                                </option>
                                              ))}
                                            </select>
                                            <button
                                              onClick={() =>
                                                ajouterGouterPrevu(groupe.blocs[0], date, ajoutsCellule[cle] ?? "")
                                              }
                                              title="Ajouter ce goûter"
                                              className="shrink-0 rounded border border-zinc-300 px-1 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-50"
                                            >
                                              +
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-right text-sm font-medium text-zinc-700">
                    Coût total estimé de la période : {FORMAT_EUR.format(coutTotalPeriode)}
                  </p>
                </div>
              )}
            </div>
          )}

          {canManage(profile.role) && modeImpression === "menu" && produits.length > 0 && (
            <div className="hidden print:block">
              <div className="flex items-baseline justify-between border-b-2 border-black pb-2">
                <h2 className="text-xl font-bold text-zinc-900">Tableau des goûters</h2>
                <p className="text-sm text-zinc-600">
                  {periode?.description} · {periode?.debut} – {periode?.fin} · Zone {zone}
                </p>
              </div>
              <table className="mt-4 w-full table-fixed border-collapse text-left text-xs">
                <thead>
                  <tr>
                    {JOURS_SEMAINE.map((j) => (
                      <th
                        key={j.numero}
                        className="w-1/5 border border-black bg-zinc-200 px-2 py-1.5 text-center font-semibold"
                      >
                        {j.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {semaines.map((semaine) => (
                    <tr key={semaine[0]}>
                      {JOURS_SEMAINE.map(({ numero }) => {
                        const date = semaine.find(
                          (d) => new Date(`${d}T00:00:00Z`).getUTCDay() === numero
                        );
                        if (!date) {
                          return <td key={numero} className="border border-black px-2 py-1.5" />;
                        }
                        return (
                          <td key={numero} className="align-top border border-black px-2 py-1.5">
                            <p className="mb-1.5 font-semibold capitalize">{formatJourCourt(date)}</p>
                            <div className="flex flex-col gap-1.5">
                              {groupesDuJour(date).map((groupe) => (
                                <div
                                  key={groupe.blocs.map(codeDeBloc).join("+")}
                                  className="border border-zinc-400 px-1.5 py-1"
                                >
                                  <p className="border-b border-zinc-300 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700">
                                    {groupe.blocs.map((b) => LABEL_BLOC[codeDeBloc(b)]).join(" + ")}
                                  </p>
                                  <div className="mt-0.5">
                                    {groupe.prevus.length === 0 ? (
                                      <p className="text-zinc-500">—</p>
                                    ) : (
                                      groupe.prevus.map((p) => (
                                        <p key={p.id}>{nomProduit(p.produit_id)}</p>
                                      ))
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canManage(profile.role) && modeImpression === "prix" && produits.length > 0 && (
            <div className="hidden print:block">
              <div className="flex items-baseline justify-between border-b-2 border-black pb-2">
                <h2 className="text-xl font-bold text-zinc-900">Quantités & prix des goûters</h2>
                <p className="text-sm text-zinc-600">
                  {periode?.description} · {periode?.debut} – {periode?.fin} · Zone {zone}
                </p>
              </div>
              <table className="mt-4 w-full border-collapse text-left text-[11px] leading-tight">
                <thead>
                  <tr>
                    <th className="border border-black bg-zinc-200 px-2 py-1 font-semibold capitalize">
                      Jour
                    </th>
                    <th className="border border-black bg-zinc-200 px-2 py-1 font-semibold">Bloc</th>
                    <th className="border border-black bg-zinc-200 px-2 py-1 font-semibold">
                      Produit
                    </th>
                    <th className="border border-black bg-zinc-200 px-2 py-1 text-center font-semibold">
                      Qté/enfant
                    </th>
                    <th className="border border-black bg-zinc-200 px-2 py-1 text-center font-semibold">
                      Qté/anim
                    </th>
                    <th className="border border-black bg-zinc-200 px-2 py-1 text-center font-semibold">
                      Enfants + anims
                    </th>
                    <th className="border border-black bg-zinc-200 px-2 py-1 text-center font-semibold">
                      Paquets
                    </th>
                    <th className="border border-black bg-zinc-200 px-2 py-1 text-right font-semibold">
                      Prix
                    </th>
                    <th className="border border-black bg-zinc-200 px-2 py-1 text-right font-semibold">
                      Total jour
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lignesPrix.map(
                    ({
                      prevu,
                      produit,
                      besoin,
                      codes,
                      premiereDuJour,
                      rowSpanJour,
                      totalJour,
                      prixParTete,
                    }) => {
                    const quantites = [...new Set(codes.map((c) => quantiteParGroupe(produit, c)))];
                    return (
                      <tr key={prevu.id}>
                        {premiereDuJour && (
                          <td
                            rowSpan={rowSpanJour}
                            className="border border-black px-2 py-1 align-top capitalize"
                          >
                            {formatJourCourt(prevu.date)}
                          </td>
                        )}
                        <td className="border border-black px-2 py-1">
                          {codes.map((c) => LABEL_BLOC[c]).join(" + ")}
                        </td>
                        <td className="border border-black px-2 py-1 font-medium">{produit.nom}</td>
                        <td className="border border-black px-2 py-1 text-center">
                          {quantites.length === 1 ? quantites[0] : quantites.join(" / ")}
                        </td>
                        <td className="border border-black px-2 py-1 text-center">
                          {besoin.animateurs > 0 ? produit.quantite_animateur : "—"}
                        </td>
                        <td className="border border-black px-2 py-1 text-center">
                          {besoin.enfants}
                          {besoin.animateurs > 0 ? ` + ${besoin.animateurs}` : ""}
                        </td>
                        <td className="border border-black px-2 py-1 text-center">{besoin.paquets}</td>
                        <td className="border border-black px-2 py-1 text-right">
                          {FORMAT_EUR.format(besoin.cout)}
                        </td>
                        {premiereDuJour && (
                          <td
                            rowSpan={rowSpanJour}
                            className="border border-black px-2 py-1 text-right align-top font-semibold"
                          >
                            {FORMAT_EUR.format(totalJour)}
                            <br />
                            <span className="font-normal text-zinc-600">
                              {prixParTete !== null
                                ? `${FORMAT_EUR.format(prixParTete)}/tête`
                                : "—"}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  }
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td
                      colSpan={8}
                      className="border border-black px-2 py-1 text-right font-semibold"
                    >
                      Total période
                    </td>
                    <td className="border border-black px-2 py-1 text-right font-semibold">
                      {FORMAT_EUR.format(coutTotalPeriode)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {canManage(profile.role) && modeImpression === "grille" && produitsUtilises.length > 0 && (
            <div className="hidden print:block">
              <div className="flex items-baseline justify-between border-b-2 border-black pb-2">
                <h2 className="text-xl font-bold text-zinc-900">Grille produits × jours</h2>
                <p className="text-sm text-zinc-600">
                  {periode?.description} · {periode?.debut} – {periode?.fin} · Zone {zone} · paquets
                  par groupe (L · T · G)
                </p>
              </div>
              {semaines.map((semaine, iSemaine) => (
                <div key={semaine[0]} className={iSemaine > 0 ? "print-page mt-6" : "mt-4"}>
                  <p className="mb-1.5 text-sm font-semibold text-zinc-700">
                    Semaine du {formatJourLong(semaine[0])} au {formatJourLong(semaine[semaine.length - 1])}
                  </p>
                  <table className="w-full border-collapse text-center text-[11px]">
                    <thead>
                      <tr>
                        <th
                          rowSpan={2}
                          className="border border-black bg-zinc-200 px-2 py-1.5 text-left align-bottom font-semibold"
                        >
                          Produit
                        </th>
                        {JOURS_SEMAINE.map(({ numero, label }) => {
                          const date = semaine.find(
                            (d) => new Date(`${d}T00:00:00Z`).getUTCDay() === numero
                          );
                          return (
                            <th
                              key={numero}
                              colSpan={3}
                              className="border border-black bg-zinc-200 px-1 py-1 font-semibold capitalize"
                            >
                              {date
                                ? `${label} ${new Date(`${date}T00:00:00Z`).getUTCDate()}`
                                : ""}
                            </th>
                          );
                        })}
                      </tr>
                      <tr>
                        {JOURS_SEMAINE.flatMap(({ numero }) =>
                          BLOCS.map((bloc) => (
                            <th
                              key={`${numero}-${codeDeBloc(bloc)}`}
                              className="border border-black px-1 py-0.5 text-[10px] font-medium"
                            >
                              {LABEL_BLOC[codeDeBloc(bloc)].charAt(0)}
                            </th>
                          ))
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {produitsUtilises
                        .filter((produit) =>
                          semaine.some((date) =>
                            goutersPrevus.some((g) => g.date === date && g.produit_id === produit.id)
                          )
                        )
                        .map((produit) => (
                        <tr key={produit.id}>
                          <td className="border border-black px-2 py-1 text-left font-medium">
                            {produit.nom}
                          </td>
                          {JOURS_SEMAINE.flatMap(({ numero }) => {
                            const date = semaine.find(
                              (d) => new Date(`${d}T00:00:00Z`).getUTCDay() === numero
                            );
                            return BLOCS.map((bloc) => {
                              const code = codeDeBloc(bloc);
                              const paquets = date
                                ? (grillePaquetsParGroupe.get(`${produit.id}|${date}|${code}`) ?? 0)
                                : 0;
                              return paquets > 0 ? (
                                <td
                                  key={`${numero}-${code}`}
                                  className="border border-black px-1 py-1 font-semibold"
                                >
                                  {paquets}
                                </td>
                              ) : (
                                <td
                                  key={`${numero}-${code}`}
                                  className="border border-black bg-zinc-200 px-1 py-1"
                                />
                              );
                            });
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {canManage(profile.role) && modeImpression === "tracabilite" && (
            <div className="hidden print:block">
              <div className="flex items-baseline justify-between border-b-2 border-black pb-2">
                <h2 className="text-xl font-bold text-zinc-900">Traçabilité des goûters</h2>
                <p className="text-sm text-zinc-600">
                  {periode?.description} · {periode?.debut} – {periode?.fin} · Zone {zone}
                </p>
              </div>
              <table className="mt-4 w-full border-collapse text-left text-xs">
                <thead>
                  <tr>
                    <th className="border border-black bg-zinc-200 px-2 py-1.5 font-semibold capitalize">
                      Date
                    </th>
                    <th className="border border-black bg-zinc-200 px-2 py-1.5 font-semibold">Bloc</th>
                    <th className="border border-black bg-zinc-200 px-2 py-1.5 font-semibold">Produit</th>
                    <th className="border border-black bg-zinc-200 px-2 py-1.5 font-semibold">Photo</th>
                    <th className="border border-black bg-zinc-200 px-2 py-1.5 font-semibold">
                      Nom produit (IA)
                    </th>
                    <th className="border border-black bg-zinc-200 px-2 py-1.5 font-semibold">
                      N° de lot
                    </th>
                    <th className="border border-black bg-zinc-200 px-2 py-1.5 font-semibold">
                      DLC/DLUO
                    </th>
                    <th className="border border-black bg-zinc-200 px-2 py-1.5 font-semibold">
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
                        const produitPrevu = produits.find((p) => p.id === prevu.produit_id);
                        const tracaRequise = produitPrevu?.tracabilite_requise ?? true;

                        // Produit exempté (ex. bananes) : pas de photo/lot/DLC à
                        // saisir, carte grisée pour signaler qu'il n'y a rien à
                        // faire côté traçabilité pour ce produit.
                        if (!tracaRequise) {
                          return (
                            <div
                              key={prevu.id}
                              className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 opacity-60"
                            >
                              <p className="font-medium text-zinc-500">{nomProduit(prevu.produit_id)}</p>
                              <span className="mt-1 inline-block rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                                Traçabilité non requise
                              </span>
                            </div>
                          );
                        }

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
