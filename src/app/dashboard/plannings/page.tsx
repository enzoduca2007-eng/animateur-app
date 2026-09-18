"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { useVacances } from "@/lib/use-vacances";
import { estWeekend, joursDe, periodeEnCours, semainesDe } from "@/lib/vacances";
import { formatHeures, heuresJour, pauseMinutes, toMinutes } from "@/lib/creneaux";
import { estMineur, plafondHeuresSemaine, peutOuvrirFermerSeul } from "@/lib/regles";
import { PeriodesVacances } from "@/components/periodes-vacances";
import {
  canManage,
  GROUPES,
  GROUPE_LABELS,
  TYPE_CRENEAU_LABELS,
  type AffectationCreneau,
  type AffectationJour,
  type Animateur,
  type Creneau,
  type EffectifJour,
  type Groupe,
  type JourFermeture,
  type PalierEncadrement,
  type TypeCreneau,
} from "@/lib/types";

const TYPES: TypeCreneau[] = ["arrivee", "pause", "depart"];

const EMPTY_CRENEAU_FORM = {
  libelle: "",
  type: "arrivee" as TypeCreneau,
  heure_debut: "",
  heure_fin: "",
};

function formatJourCourt(dateISO: string) {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function PlanningsPage() {
  const profile = useProfile();
  const supabase = createClient();
  const editable = canManage(profile.role);
  const monGroupe = profile.role === "coordinateur" ? profile.groupe_coordinateur : null;
  const groupesGeres = useMemo(
    () => (monGroupe ? GROUPES.filter((g) => g === monGroupe) : GROUPES),
    [monGroupe]
  );
  const { periodes, zone, loading: loadingVacances } = useVacances();

  const [animateurs, setAnimateurs] = useState<Animateur[]>([]);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [affectations, setAffectations] = useState<AffectationCreneau[]>([]);
  const [affectationsJour, setAffectationsJour] = useState<AffectationJour[]>([]);
  const [periodeIndex, setPeriodeIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [celluleOuverte, setCelluleOuverte] = useState<
    { creneauId: string; date: string; groupe: Groupe } | null
  >(null);
  const [showCreneaux, setShowCreneaux] = useState(false);
  const [formCreneau, setFormCreneau] = useState(EMPTY_CRENEAU_FORM);
  const [joursFermeture, setJoursFermeture] = useState<JourFermeture[]>([]);
  const [showFermetures, setShowFermetures] = useState(false);
  const [formFermeture, setFormFermeture] = useState({ date: "", motif: "" });
  const [semaineIndex, setSemaineIndex] = useState(0);
  const [groupeSelectionne, setGroupeSelectionne] = useState<Groupe>(monGroupe ?? GROUPES[0]);
  const [effectifs, setEffectifs] = useState<EffectifJour[]>([]);
  const [paliers, setPaliers] = useState<PalierEncadrement[]>([]);
  const [showPaliers, setShowPaliers] = useState(false);
  const [formPalier, setFormPalier] = useState({ effectif_min: "", nb_animateurs: "" });

  async function chargerCreneaux() {
    const { data } = await supabase
      .from("creneaux")
      .select("*")
      .order("type")
      .order("heure_debut");
    if (data) setCreneaux(data as Creneau[]);
  }

  async function chargerFermetures() {
    const { data } = await supabase
      .from("jours_fermeture")
      .select("*")
      .order("date");
    if (data) setJoursFermeture(data as JourFermeture[]);
  }

  async function chargerPaliers() {
    const { data } = await supabase
      .from("paliers_encadrement")
      .select("*")
      .order("effectif_min");
    if (data) setPaliers(data as PalierEncadrement[]);
  }

  useEffect(() => {
    supabase
      .from("animateurs")
      .select("*")
      .eq("statut", "actif")
      .order("nom")
      .then(({ data }) => {
        if (data) setAnimateurs(data as Animateur[]);
      });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    chargerCreneaux();
    chargerFermetures();
    chargerPaliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loadingVacances || periodes.length === 0 || periodeIndex !== null)
      return;
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const defaut = periodeEnCours(periodes, aujourdhui);
    const index = periodes.findIndex((p) => p === defaut);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPeriodeIndex(index >= 0 ? index : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingVacances, periodes]);

  const periode = periodeIndex !== null ? periodes[periodeIndex] : null;
  const jours = useMemo(() => (periode ? joursDe(periode) : []), [periode]);

  const joursFermesSet = useMemo(
    () => new Set(joursFermeture.map((f) => f.date)),
    [joursFermeture]
  );

  // Jours réellement travaillés : ni week-end, ni fermeture exceptionnelle.
  const joursOuvres = useMemo(
    () => jours.filter((j) => !estWeekend(j) && !joursFermesSet.has(j)),
    [jours, joursFermesSet]
  );

  const semaines = useMemo(() => semainesDe(joursOuvres), [joursOuvres]);
  const semaineIndexSafe = Math.min(semaineIndex, Math.max(0, semaines.length - 1));

  async function loadAffectations(debut: string, fin: string) {
    setLoading(true);
    const [{ data: c }, { data: j }, { data: e }] = await Promise.all([
      supabase
        .from("affectations_creneau")
        .select("*")
        .gte("date", debut)
        .lte("date", fin),
      supabase
        .from("affectations_jour")
        .select("*")
        .gte("date", debut)
        .lte("date", fin),
      supabase
        .from("effectifs_jour")
        .select("*")
        .gte("date", debut)
        .lte("date", fin),
    ]);
    setAffectations((c as AffectationCreneau[]) ?? []);
    setAffectationsJour((j as AffectationJour[]) ?? []);
    setEffectifs((e as EffectifJour[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (periode) loadAffectations(periode.debut, periode.fin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode]);

  const animateursParCellule = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of affectations) {
      const cle = `${a.creneau_id}|${a.date}`;
      map.set(cle, [...(map.get(cle) ?? []), a.animateur_id]);
    }
    return map;
  }, [affectations]);

  function animateursDe(creneauId: string, date: string) {
    return animateursParCellule.get(`${creneauId}|${date}`) ?? [];
  }

  const animateursParGroupeJour = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of affectationsJour) {
      const cle = `${a.groupe}|${a.date}`;
      map.set(cle, [...(map.get(cle) ?? []), a.animateur_id]);
    }
    return map;
  }, [affectationsJour]);

  function animateursDuGroupe(groupe: Groupe, date: string) {
    return animateursParGroupeJour.get(`${groupe}|${date}`) ?? [];
  }

  const effectifParCle = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of effectifs) map.set(`${e.groupe}|${e.date}`, e.effectif);
    return map;
  }, [effectifs]);

  function effectifDe(groupe: Groupe, date: string): number | null {
    return effectifParCle.get(`${groupe}|${date}`) ?? null;
  }

  // Nombre minimum d'animateurs à l'ouverture/fermeture selon l'effectif
  // du jour et les paliers configurés (le palier le plus élevé dont le
  // seuil est atteint). 1 par défaut si l'effectif n'a pas été renseigné
  // ou si aucun palier n'est défini.
  function nbRequisEncadrement(groupe: Groupe, date: string) {
    const effectif = effectifDe(groupe, date);
    if (effectif === null || effectif === 0 || paliers.length === 0) return 1;
    const applicables = paliers.filter((p) => p.effectif_min <= effectif);
    if (applicables.length === 0) return 1;
    return applicables.reduce((max, p) => (p.nb_animateurs > max ? p.nb_animateurs : max), 1);
  }

  async function majEffectif(groupe: Groupe, date: string, valeur: number) {
    setEffectifs((prev) => [
      ...prev.filter((e) => !(e.groupe === groupe && e.date === date)),
      { id: `optimistic-${groupe}-${date}`, date, groupe, effectif: valeur, created_by: profile.id, created_at: new Date().toISOString() },
    ]);
    const { error } = await supabase
      .from("effectifs_jour")
      .upsert(
        { date, groupe, effectif: valeur, created_by: profile.id },
        { onConflict: "date,groupe" }
      );
    if (error) setErreur(error.message);
  }

  async function ajouterPalier(e: React.FormEvent) {
    e.preventDefault();
    const effectif_min = Number(formPalier.effectif_min);
    const nb_animateurs = Number(formPalier.nb_animateurs);
    if (!Number.isFinite(effectif_min) || !Number.isFinite(nb_animateurs) || nb_animateurs < 1)
      return;
    const { error } = await supabase
      .from("paliers_encadrement")
      .upsert({ effectif_min, nb_animateurs }, { onConflict: "effectif_min" });
    if (error) {
      setErreur(error.message);
      return;
    }
    setFormPalier({ effectif_min: "", nb_animateurs: "" });
    chargerPaliers();
  }

  async function supprimerPalier(id: string) {
    await supabase.from("paliers_encadrement").delete().eq("id", id);
    chargerPaliers();
  }

  async function toggleAffectation(
    creneauId: string,
    date: string,
    animateurId: string,
    assigne: boolean
  ) {
    setErreur(null);
    setAffectations((prev) =>
      assigne
        ? [
            ...prev,
            {
              id: `optimistic-${creneauId}-${date}-${animateurId}`,
              date,
              creneau_id: creneauId,
              animateur_id: animateurId,
              created_by: profile.id,
              created_at: new Date().toISOString(),
            },
          ]
        : prev.filter(
            (a) =>
              !(
                a.creneau_id === creneauId &&
                a.date === date &&
                a.animateur_id === animateurId
              )
          )
    );

    if (assigne) {
      const { error } = await supabase.from("affectations_creneau").upsert(
        { date, creneau_id: creneauId, animateur_id: animateurId, created_by: profile.id },
        { onConflict: "date,creneau_id,animateur_id" }
      );
      if (error) setErreur(error.message);
    } else {
      const { error } = await supabase
        .from("affectations_creneau")
        .delete()
        .eq("date", date)
        .eq("creneau_id", creneauId)
        .eq("animateur_id", animateurId);
      if (error) setErreur(error.message);
    }
  }

  async function ajouterCreneau(e: React.FormEvent) {
    e.preventDefault();
    if (!formCreneau.libelle || !formCreneau.heure_debut) return;

    const { error } = await supabase.from("creneaux").insert({
      libelle: formCreneau.libelle,
      type: formCreneau.type,
      heure_debut: formCreneau.heure_debut,
      heure_fin: formCreneau.type === "pause" ? formCreneau.heure_fin || null : null,
    });
    if (error) {
      setErreur(error.message);
      return;
    }
    setFormCreneau(EMPTY_CRENEAU_FORM);
    chargerCreneaux();
  }

  async function supprimerCreneau(id: string) {
    if (!confirm("Supprimer ce créneau ? Les affectations liées seront perdues."))
      return;
    await supabase.from("creneaux").delete().eq("id", id);
    chargerCreneaux();
  }

  async function ajouterFermeture(e: React.FormEvent) {
    e.preventDefault();
    if (!formFermeture.date) return;
    const { error } = await supabase.from("jours_fermeture").insert({
      date: formFermeture.date,
      motif: formFermeture.motif || null,
    });
    if (error) {
      setErreur(error.message);
      return;
    }
    setFormFermeture({ date: "", motif: "" });
    chargerFermetures();
  }

  async function supprimerFermeture(id: string) {
    await supabase.from("jours_fermeture").delete().eq("id", id);
    chargerFermetures();
  }

  // Créneau d'ouverture = arrivée la plus tôt, de fermeture = départ le plus
  // tard, dans le catalogue de créneaux actuel.
  const creneauOuverture = useMemo(() => {
    const arrivees = creneaux.filter((c) => c.type === "arrivee");
    return arrivees.length
      ? arrivees.reduce((min, c) => (c.heure_debut < min.heure_debut ? c : min))
      : null;
  }, [creneaux]);

  const creneauFermeture = useMemo(() => {
    const departs = creneaux.filter((c) => c.type === "depart");
    return departs.length
      ? departs.reduce((max, c) => (c.heure_debut > max.heure_debut ? c : max))
      : null;
  }, [creneaux]);

  function stagiaireSeul(creneauId: string, date: string, groupe: Groupe) {
    const eligibles = animateursDuGroupe(groupe, date);
    const ids = animateursDe(creneauId, date).filter((id) => eligibles.includes(id));
    if (ids.length === 0) return false;
    return ids.every((id) => {
      const a = animateurs.find((x) => x.id === id);
      return !a || !peutOuvrirFermerSeul(a);
    });
  }

  // Moins d'animateurs assignés à l'ouverture/fermeture que ce que
  // l'effectif du jour exige (taux d'encadrement).
  function encadrementInsuffisant(creneauId: string, date: string, groupe: Groupe) {
    const eligibles = animateursDuGroupe(groupe, date);
    const ids = animateursDe(creneauId, date).filter((id) => eligibles.includes(id));
    if (ids.length === 0) return false;
    return ids.length < nbRequisEncadrement(groupe, date);
  }

  // Un même animateur ne doit jamais ouvrir ET fermer le même jour.
  function ouvreEtFerme(date: string, groupe: Groupe) {
    if (!creneauOuverture || !creneauFermeture) return [];
    const eligibles = animateursDuGroupe(groupe, date);
    const ouvreurs = animateursDe(creneauOuverture.id, date).filter((id) =>
      eligibles.includes(id)
    );
    const fermeurs = animateursDe(creneauFermeture.id, date).filter((id) =>
      eligibles.includes(id)
    );
    return ouvreurs.filter((id) => fermeurs.includes(id));
  }

  // Jours (dans la période) où chaque animateur a une pause < 1h alors
  // qu'il travaille (arrivée + départ assignés) ce jour-là.
  const violationsPause = useMemo(() => {
    const set = new Set<string>();
    for (const a of animateurs) {
      for (const j of joursOuvres) {
        const ids = new Set(
          affectations
            .filter((aff) => aff.date === j && aff.animateur_id === a.id)
            .map((aff) => aff.creneau_id)
        );
        if (ids.size === 0) continue;
        const creneauxAssignes = creneaux.filter((c) => ids.has(c.id));
        if (heuresJour(creneauxAssignes) === null) continue;
        if (pauseMinutes(creneauxAssignes) < 60) set.add(`${a.id}|${j}`);
      }
    }
    return set;
  }, [animateurs, joursOuvres, affectations, creneaux]);

  const semaineJoursSelectionnee = semaines[semaineIndexSafe] ?? [];
  const semaineKey = semaineJoursSelectionnee.join(",");
  const finSemaineSelectionnee =
    semaineJoursSelectionnee[semaineJoursSelectionnee.length - 1] ??
    new Date().toISOString().slice(0, 10);

  // Total d'heures par animateur sur la seule semaine affichée (les
  // plafonds légaux sont hebdomadaires).
  const heuresSemaineParAnimateur = useMemo(() => {
    const totaux = new Map<string, number>();
    for (const a of animateurs) {
      let total = 0;
      for (const j of semaineJoursSelectionnee) {
        const ids = new Set(
          affectations
            .filter((aff) => aff.date === j && aff.animateur_id === a.id)
            .map((aff) => aff.creneau_id)
        );
        const creneauxAssignes = creneaux.filter((c) => ids.has(c.id));
        const h = heuresJour(creneauxAssignes);
        if (h) total += h;
      }
      totaux.set(a.id, total);
    }
    return totaux;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateurs, semaineKey, affectations, creneaux]);

  // Animateurs qui travaillent (dans un groupe) au moins un jour cette
  // semaine — sert à ne pas signaler de "0 ouverture" pour quelqu'un
  // d'absent toute la semaine.
  const animateursActifsSemaine = useMemo(() => {
    const ids = new Set<string>();
    for (const groupe of groupesGeres) {
      for (const j of semaineJoursSelectionnee) {
        for (const id of animateursDuGroupe(groupe, j)) ids.add(id);
      }
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semaineKey, animateursParGroupeJour, groupesGeres]);

  // Nombre d'ouvertures/fermetures par animateur cette semaine.
  const compteursOF = useMemo(() => {
    const ouvertures = new Map<string, number>();
    const fermetures = new Map<string, number>();
    for (const aff of affectations) {
      if (!semaineJoursSelectionnee.includes(aff.date)) continue;
      if (creneauOuverture && aff.creneau_id === creneauOuverture.id) {
        ouvertures.set(aff.animateur_id, (ouvertures.get(aff.animateur_id) ?? 0) + 1);
      }
      if (creneauFermeture && aff.creneau_id === creneauFermeture.id) {
        fermetures.set(aff.animateur_id, (fermetures.get(aff.animateur_id) ?? 0) + 1);
      }
    }
    return { ouvertures, fermetures };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affectations, creneauOuverture, creneauFermeture, semaineKey]);

  async function autoRepartirSemaine() {
    const arrivees = creneaux
      .filter((c) => c.type === "arrivee")
      .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));
    const departs = creneaux
      .filter((c) => c.type === "depart")
      .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));
    const pauses = creneaux.filter((c) => c.type === "pause");

    if (arrivees.length === 0 || departs.length === 0) {
      setErreur("Il faut au moins un créneau d'arrivée et un créneau de départ définis.");
      return;
    }
    if (semaineJoursSelectionnee.length === 0) return;
    if (
      !confirm(
        "Ça va remplacer TOUTES les affectations (arrivées, pauses, départs) " +
          "des animateurs concernés pour cette semaine. Continuer ?"
      )
    )
      return;

    const ouverture = arrivees[0];
    const fermeture = departs[departs.length - 1];
    const autresArrivees = arrivees.filter((c) => c.id !== ouverture.id);
    const autresDeparts = departs.filter((c) => c.id !== fermeture.id);

    const compteurOuverture = new Map<string, number>();
    const compteurFermeture = new Map<string, number>();
    const compteurArrivee = new Map<string, number>();
    const compteurDepart = new Map<string, number>();
    const compteurPause = new Map<string, number>();

    function incr(map: Map<string, number>, cle: string) {
      map.set(cle, (map.get(cle) ?? 0) + 1);
    }

    // Choisit n personnes : au moins une non-stagiaire si possible (jamais
    // seuls des stagiaires), le reste réparti sur tout le monde pour ne
    // pas surcharger systématiquement les mêmes non-stagiaires.
    // prioritaires : personnes à privilégier si possible (ex: qui a fermé
    // hier, pour qu'elle rouvre avec la clé qu'elle a déjà) sans jamais
    // casser la garantie "jamais un stagiaire seul".
    function choisirPlusieurs(
      eligibles: string[],
      compteur: Map<string, number>,
      n: number,
      exclure: Set<string>,
      prioritaires: string[] = []
    ) {
      if (prioritaires.length > 0) {
        const compteurAjuste = new Map(compteur);
        for (const id of prioritaires) {
          compteurAjuste.set(id, (compteurAjuste.get(id) ?? 0) - 1000);
        }
        compteur = compteurAjuste;
      }
      const choisis: string[] = [];
      let poolRestant = eligibles.filter((id) => !exclure.has(id));
      if (n === 0 || poolRestant.length === 0) return choisis;

      const nonStagiaires = poolRestant.filter((id) => {
        const a = animateurs.find((x) => x.id === id);
        return a && peutOuvrirFermerSeul(a);
      });
      if (nonStagiaires.length > 0) {
        const premier = nonStagiaires.reduce((m, id) =>
          (compteur.get(id) ?? 0) < (compteur.get(m) ?? 0) ? id : m
        );
        choisis.push(premier);
        poolRestant = poolRestant.filter((id) => id !== premier);
      }
      while (choisis.length < n && poolRestant.length > 0) {
        const pick = poolRestant.reduce((m, id) =>
          (compteur.get(id) ?? 0) < (compteur.get(m) ?? 0) ? id : m
        );
        choisis.push(pick);
        poolRestant = poolRestant.filter((id) => id !== pick);
      }
      return choisis;
    }

    function moinsUtilise(items: Creneau[], compteur: Map<string, number>) {
      return items.reduce((meilleur, c) =>
        (compteur.get(c.id) ?? 0) < (compteur.get(meilleur.id) ?? 0) ? c : meilleur
      );
    }

    // Choisit, parmi des options, celle dont la durée (en heures, pause
    // d'1h déjà déduite) se rapproche le plus d'une cible — pour viser le
    // plafond hebdomadaire plutôt que de l'ignorer.
    function optionLaPlusProche<T extends { id: string }>(
      options: T[],
      duree: (o: T) => number,
      cible: number,
      compteur: Map<string, number>
    ) {
      return options.reduce((meilleur, o) => {
        const ecart = Math.abs(duree(o) - cible);
        const ecartMeilleur = Math.abs(duree(meilleur) - cible);
        if (ecart < ecartMeilleur) return o;
        if (
          ecart === ecartMeilleur &&
          (compteur.get(o.id) ?? 0) < (compteur.get(meilleur.id) ?? 0)
        )
          return o;
        return meilleur;
      });
    }

    // Combien de jours (dans un groupe) chaque animateur travaille cette
    // semaine, pour répartir son quota d'heures sur ses jours réels.
    const joursTravaillesTotal = new Map<string, number>();
    for (const groupe of GROUPES) {
      for (const j of semaineJoursSelectionnee) {
        for (const id of animateursDuGroupe(groupe, j)) {
          joursTravaillesTotal.set(id, (joursTravaillesTotal.get(id) ?? 0) + 1);
        }
      }
    }

    const joursTraites = new Map<string, number>();
    const heuresAccumulees = new Map<string, number>();

    function cibleDuJour(id: string) {
      const a = animateurs.find((x) => x.id === id);
      const mineur = estMineur(a?.date_naissance ?? null, finSemaineSelectionnee);
      const plafond = plafondHeuresSemaine(mineur);
      const restant = plafond - (heuresAccumulees.get(id) ?? 0);
      const joursRestants = Math.max(
        1,
        (joursTravaillesTotal.get(id) ?? 1) - (joursTraites.get(id) ?? 0)
      );
      // Pas de plancher artificiel : viser pile ce qu'il reste à faire sur
      // les jours restants, sinon on risque de dépasser le quota en fin de
      // semaine quand peu de budget reste.
      return restant / joursRestants;
    }

    function enregistrerHeures(id: string, heures: number) {
      heuresAccumulees.set(id, (heuresAccumulees.get(id) ?? 0) + Math.max(0, heures));
      joursTraites.set(id, (joursTraites.get(id) ?? 0) + 1);
    }

    const nouvelles: { date: string; creneau_id: string; animateur_id: string }[] = [];

    for (const groupe of groupesGeres) {
      let fermeursVeille: string[] = [];
      for (const j of semaineJoursSelectionnee) {
        const eligibles = animateursDuGroupe(groupe, j);
        if (eligibles.length === 0) continue;

        // Ouverture / fermeture : autant de personnes que l'effectif du
        // jour l'exige, rotation équitable, jamais un stagiaire seul, et
        // jamais la même personne à l'ouverture ET à la fermeture. On
        // privilégie, pour ouvrir, qui a fermé la veille (continuité de
        // la clé), quand c'est possible.
        const nbRequis = Math.min(nbRequisEncadrement(groupe, j), eligibles.length);
        const openers = choisirPlusieurs(
          eligibles,
          compteurOuverture,
          nbRequis,
          new Set(),
          fermeursVeille
        );
        const closers = choisirPlusieurs(
          eligibles,
          compteurFermeture,
          nbRequis,
          new Set(openers)
        );
        fermeursVeille = closers;

        for (const id of openers) {
          incr(compteurOuverture, id);
          incr(compteurArrivee, ouverture.id);
          nouvelles.push({ date: j, creneau_id: ouverture.id, animateur_id: id });

          const options = autresDeparts.length > 0 ? autresDeparts : [fermeture];
          const depart = optionLaPlusProche(
            options,
            (c) => (toMinutes(c.heure_debut) - toMinutes(ouverture.heure_debut)) / 60 - 1,
            cibleDuJour(id),
            compteurDepart
          );
          incr(compteurDepart, depart.id);
          nouvelles.push({ date: j, creneau_id: depart.id, animateur_id: id });
          enregistrerHeures(
            id,
            (toMinutes(depart.heure_debut) - toMinutes(ouverture.heure_debut)) / 60 - 1
          );
        }

        for (const id of closers) {
          incr(compteurFermeture, id);
          incr(compteurDepart, fermeture.id);
          nouvelles.push({ date: j, creneau_id: fermeture.id, animateur_id: id });

          const options = autresArrivees.length > 0 ? autresArrivees : [ouverture];
          const arrivee = optionLaPlusProche(
            options,
            (c) => (toMinutes(fermeture.heure_debut) - toMinutes(c.heure_debut)) / 60 - 1,
            cibleDuJour(id),
            compteurArrivee
          );
          incr(compteurArrivee, arrivee.id);
          nouvelles.push({ date: j, creneau_id: arrivee.id, animateur_id: id });
          enregistrerHeures(
            id,
            (toMinutes(fermeture.heure_debut) - toMinutes(arrivee.heure_debut)) / 60 - 1
          );
        }

        // Les autres : arrivée + départ choisis ensemble pour viser leur
        // plafond hebdomadaire.
        for (const id of eligibles) {
          if (openers.includes(id) || closers.includes(id)) continue;

          const optionsArrivee = autresArrivees.length > 0 ? autresArrivees : [ouverture];
          const optionsDepart = autresDeparts.length > 0 ? autresDeparts : [fermeture];
          const cible = cibleDuJour(id);

          const paire = optionsArrivee
            .flatMap((ar) => optionsDepart.map((de) => ({ ar, de })))
            .reduce((meilleure, p) => {
              const duree = (c: typeof p) =>
                (toMinutes(c.de.heure_debut) - toMinutes(c.ar.heure_debut)) / 60 - 1;
              const ecart = Math.abs(duree(p) - cible);
              const ecartMeilleure = Math.abs(duree(meilleure) - cible);
              if (ecart < ecartMeilleure) return p;
              if (
                ecart === ecartMeilleure &&
                (compteurArrivee.get(p.ar.id) ?? 0) + (compteurDepart.get(p.de.id) ?? 0) <
                  (compteurArrivee.get(meilleure.ar.id) ?? 0) +
                    (compteurDepart.get(meilleure.de.id) ?? 0)
              )
                return p;
              return meilleure;
            });

          incr(compteurArrivee, paire.ar.id);
          incr(compteurDepart, paire.de.id);
          nouvelles.push({ date: j, creneau_id: paire.ar.id, animateur_id: id });
          nouvelles.push({ date: j, creneau_id: paire.de.id, animateur_id: id });
          enregistrerHeures(
            id,
            (toMinutes(paire.de.heure_debut) - toMinutes(paire.ar.heure_debut)) / 60 - 1
          );
        }

        // Pause obligatoire d'au moins 1h pour chacun.
        if (pauses.length > 0) {
          for (const id of eligibles) {
            let cumul = 0;
            const dispo = [...pauses];
            while (cumul < 60 && dispo.length > 0) {
              const c = moinsUtilise(dispo, compteurPause);
              incr(compteurPause, c.id);
              nouvelles.push({ date: j, creneau_id: c.id, animateur_id: id });
              cumul += c.heure_fin ? toMinutes(c.heure_fin) - toMinutes(c.heure_debut) : 60;
              dispo.splice(
                dispo.findIndex((x) => x.id === c.id),
                1
              );
            }
          }
        }
      }
    }

    setErreur(null);

    const { error: errDel } = await supabase
      .from("affectations_creneau")
      .delete()
      .in(
        "creneau_id",
        creneaux.map((c) => c.id)
      )
      .in("date", semaineJoursSelectionnee);
    if (errDel) {
      setErreur(errDel.message);
      return;
    }

    if (nouvelles.length > 0) {
      const { error: errIns } = await supabase
        .from("affectations_creneau")
        .insert(nouvelles.map((a) => ({ ...a, created_by: profile.id })));
      if (errIns) {
        setErreur(errIns.message);
        return;
      }
    }

    if (periode) loadAffectations(periode.debut, periode.fin);
  }

  type CategorieAlerte =
    | "ouverture-fermeture"
    | "pause"
    | "heures"
    | "rotation"
    | "effectif"
    | "cle";
  const CATEGORIE_ALERTE_INFO: Record<
    CategorieAlerte,
    { titre: string; icone: string }
  > = {
    "ouverture-fermeture": { titre: "Ouverture / fermeture", icone: "🔓" },
    pause: { titre: "Pauses", icone: "☕" },
    heures: { titre: "Heures", icone: "⏱️" },
    rotation: { titre: "Rotation ouverture/fermeture", icone: "🔁" },
    effectif: { titre: "Taux d'encadrement", icone: "👥" },
    cle: { titre: "Continuité des clés", icone: "🔑" },
  };

  // Alertes de la semaine affichée, regroupées par catégorie.
  const alertes = useMemo(() => {
    const liste: { categorie: CategorieAlerte; texte: string }[] = [];

    for (const groupe of groupesGeres) {
      for (const j of semaineJoursSelectionnee) {
        if (creneauOuverture && stagiaireSeul(creneauOuverture.id, j, groupe)) {
          liste.push({
            categorie: "ouverture-fermeture",
            texte: `${GROUPE_LABELS[groupe]} · ${formatJourCourt(j)} : uniquement des stagiaires à l'ouverture (${creneauOuverture.libelle})`,
          });
        }
        if (creneauFermeture && stagiaireSeul(creneauFermeture.id, j, groupe)) {
          liste.push({
            categorie: "ouverture-fermeture",
            texte: `${GROUPE_LABELS[groupe]} · ${formatJourCourt(j)} : uniquement des stagiaires à la fermeture (${creneauFermeture.libelle})`,
          });
        }
        if (creneauOuverture && encadrementInsuffisant(creneauOuverture.id, j, groupe)) {
          liste.push({
            categorie: "effectif",
            texte: `${GROUPE_LABELS[groupe]} · ${formatJourCourt(j)} : ${nbRequisEncadrement(groupe, j)} animateur(s) requis à l'ouverture selon l'effectif (${effectifDe(groupe, j) ?? "?"} enfants), pas assez assignés`,
          });
        }
        if (creneauFermeture && encadrementInsuffisant(creneauFermeture.id, j, groupe)) {
          liste.push({
            categorie: "effectif",
            texte: `${GROUPE_LABELS[groupe]} · ${formatJourCourt(j)} : ${nbRequisEncadrement(groupe, j)} animateur(s) requis à la fermeture selon l'effectif (${effectifDe(groupe, j) ?? "?"} enfants), pas assez assignés`,
          });
        }
        for (const id of ouvreEtFerme(j, groupe)) {
          const a = animateurs.find((an) => an.id === id);
          liste.push({
            categorie: "ouverture-fermeture",
            texte: `${GROUPE_LABELS[groupe]} · ${formatJourCourt(j)} : ${a?.prenom} ${a?.nom} ouvre ET ferme le même jour`,
          });
        }
      }
    }

    // Continuité de la clé : qui ferme un jour devrait rouvrir le
    // lendemain, sinon il faut prévoir explicitement la remise de clé.
    if (creneauOuverture && creneauFermeture) {
      for (const groupe of groupesGeres) {
        for (let i = 0; i < semaineJoursSelectionnee.length - 1; i++) {
          const j = semaineJoursSelectionnee[i];
          const jSuivant = semaineJoursSelectionnee[i + 1];
          const eligiblesJ = animateursDuGroupe(groupe, j);
          const fermeurs = animateursDe(creneauFermeture.id, j).filter((id) =>
            eligiblesJ.includes(id)
          );
          if (fermeurs.length === 0) continue;

          const eligiblesLendemain = animateursDuGroupe(groupe, jSuivant);
          const ouvreursLendemain = animateursDe(creneauOuverture.id, jSuivant).filter((id) =>
            eligiblesLendemain.includes(id)
          );
          if (ouvreursLendemain.length === 0) continue;

          if (!fermeurs.some((id) => ouvreursLendemain.includes(id))) {
            const noms = fermeurs
              .map((id) => animateurs.find((a) => a.id === id))
              .filter(Boolean)
              .map((a) => `${a!.prenom} ${a!.nom}`)
              .join(", ");
            liste.push({
              categorie: "cle",
              texte: `${GROUPE_LABELS[groupe]} · ${formatJourCourt(j)} → ${formatJourCourt(jSuivant)} : ${noms} ferme mais n'ouvre pas le lendemain — prévoir qui prend la clé`,
            });
          }
        }
      }
    }

    for (const a of animateurs) {
      for (const j of semaineJoursSelectionnee) {
        if (violationsPause.has(`${a.id}|${j}`)) {
          liste.push({
            categorie: "pause",
            texte: `${a.prenom} ${a.nom} · ${formatJourCourt(j)} : pause inférieure à 1h`,
          });
        }
      }
      const mineur = estMineur(a.date_naissance, finSemaineSelectionnee);
      const plafond = plafondHeuresSemaine(mineur);
      const total = heuresSemaineParAnimateur.get(a.id) ?? 0;
      if (animateursActifsSemaine.has(a.id)) {
        const ecart = total - plafond;
        if (ecart > 1) {
          liste.push({
            categorie: "heures",
            texte: `${a.prenom} ${a.nom} : ${formatHeures(total)} cette semaine, ${formatHeures(ecart)} au-delà du plafond ${
              mineur ? "mineur" : "majeur"
            } (${plafond}h)`,
          });
        } else if (ecart < -1) {
          liste.push({
            categorie: "heures",
            texte: `${a.prenom} ${a.nom} : ${formatHeures(total)} cette semaine, ${formatHeures(-ecart)} en dessous du quota ${
              mineur ? "mineur" : "majeur"
            } (${plafond}h)`,
          });
        }

        const nbOuvertures = compteursOF.ouvertures.get(a.id) ?? 0;
        const nbFermetures = compteursOF.fermetures.get(a.id) ?? 0;
        if (nbOuvertures === 0) {
          liste.push({
            categorie: "rotation",
            texte: `${a.prenom} ${a.nom} : n'ouvre jamais cette semaine (minimum 1 fois)`,
          });
        } else if (nbOuvertures > 2) {
          liste.push({
            categorie: "rotation",
            texte: `${a.prenom} ${a.nom} : ouvre ${nbOuvertures} fois cette semaine (maximum 2)`,
          });
        }
        if (nbFermetures === 0) {
          liste.push({
            categorie: "rotation",
            texte: `${a.prenom} ${a.nom} : ne ferme jamais cette semaine (minimum 1 fois)`,
          });
        } else if (nbFermetures > 2) {
          liste.push({
            categorie: "rotation",
            texte: `${a.prenom} ${a.nom} : ferme ${nbFermetures} fois cette semaine (maximum 2)`,
          });
        }
      }
    }

    return liste;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    animateurs,
    semaineKey,
    creneauOuverture,
    creneauFermeture,
    violationsPause,
    heuresSemaineParAnimateur,
    finSemaineSelectionnee,
    animateursParGroupeJour,
    animateursParCellule,
    animateursActifsSemaine,
    compteursOF,
    effectifParCle,
    paliers,
    groupesGeres,
  ]);

  const alertesParCategorie = useMemo(() => {
    const map = new Map<CategorieAlerte, string[]>();
    for (const { categorie, texte } of alertes) {
      map.set(categorie, [...(map.get(categorie) ?? []), texte]);
    }
    return map;
  }, [alertes]);

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Planning</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {editable
              ? "Clique une case pour affecter des animateurs à un créneau."
              : "Consulte qui est présent à chaque créneau."}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Télécharger en PDF
          </button>
          {editable && (
            <button
              onClick={() => setShowCreneaux((v) => !v)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {showCreneaux ? "Fermer les créneaux" : "Gérer les créneaux"}
            </button>
          )}
          {editable && (
            <button
              onClick={() => setShowFermetures((v) => !v)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {showFermetures ? "Fermer" : "Jours de fermeture"}
            </button>
          )}
          {editable && (
            <button
              onClick={() => setShowPaliers((v) => !v)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {showPaliers ? "Fermer" : "Paliers d'encadrement"}
            </button>
          )}
        </div>
      </div>

      {showPaliers && editable && (
        <div className="no-print rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="mb-1 text-sm font-medium text-zinc-900">
            Paliers d&apos;encadrement (ouverture/fermeture)
          </p>
          <p className="mb-3 text-xs text-zinc-500">
            Les enfants arrivent de façon échelonnée : ce n&apos;est pas un
            simple ratio effectif/animateur, mais ta propre estimation de
            combien d&apos;animateurs sont nécessaires à ces moments-là
            selon l&apos;effectif prévu.
          </p>
          {paliers.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {paliers.map((p) => (
                <span
                  key={p.id}
                  className="flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700"
                >
                  ≥ {p.effectif_min} enfants → {p.nb_animateurs} anim
                  {p.nb_animateurs > 1 ? "s" : ""}
                  <button
                    onClick={() => supprimerPalier(p.id)}
                    className="text-zinc-400 hover:text-red-600"
                    title="Supprimer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <form onSubmit={ajouterPalier} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs text-zinc-500">À partir de (enfants)</label>
              <input
                type="number"
                min={0}
                required
                value={formPalier.effectif_min}
                onChange={(e) =>
                  setFormPalier({ ...formPalier, effectif_min: e.target.value })
                }
                className="w-28 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Animateurs requis</label>
              <input
                type="number"
                min={1}
                required
                value={formPalier.nb_animateurs}
                onChange={(e) =>
                  setFormPalier({ ...formPalier, nb_animateurs: e.target.value })
                }
                className="w-28 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              + Ajouter
            </button>
          </form>
        </div>
      )}

      {erreur && (
        <p className="no-print rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {erreur}
        </p>
      )}

      {showCreneaux && editable && (
        <div className="no-print rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-medium text-zinc-900">Créneaux</p>
          <div className="flex flex-col gap-2">
            {TYPES.map((type) => (
              <div key={type} className="flex flex-wrap items-center gap-2">
                <span className="w-20 text-xs font-medium text-zinc-400">
                  {TYPE_CRENEAU_LABELS[type]}
                </span>
                {creneaux
                  .filter((c) => c.type === type)
                  .map((c) => (
                    <span
                      key={c.id}
                      className="flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700"
                    >
                      {c.libelle}
                      <button
                        onClick={() => supprimerCreneau(c.id)}
                        className="text-zinc-400 hover:text-red-600"
                        title="Supprimer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
              </div>
            ))}
          </div>

          <form onSubmit={ajouterCreneau} className="mt-4 flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs text-zinc-500">Libellé</label>
              <input
                placeholder="Ex: 9h ou Fermeture 19h"
                value={formCreneau.libelle}
                onChange={(e) =>
                  setFormCreneau({ ...formCreneau, libelle: e.target.value })
                }
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Type</label>
              <select
                value={formCreneau.type}
                onChange={(e) =>
                  setFormCreneau({
                    ...formCreneau,
                    type: e.target.value as TypeCreneau,
                  })
                }
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_CRENEAU_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500">
                Heure {formCreneau.type === "pause" ? "début" : ""}
              </label>
              <input
                type="time"
                required
                value={formCreneau.heure_debut}
                onChange={(e) =>
                  setFormCreneau({ ...formCreneau, heure_debut: e.target.value })
                }
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </div>
            {formCreneau.type === "pause" && (
              <div>
                <label className="block text-xs text-zinc-500">Heure fin</label>
                <input
                  type="time"
                  required
                  value={formCreneau.heure_fin}
                  onChange={(e) =>
                    setFormCreneau({ ...formCreneau, heure_fin: e.target.value })
                  }
                  className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </div>
            )}
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              + Ajouter
            </button>
          </form>
        </div>
      )}

      {showFermetures && editable && (
        <div className="no-print rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-medium text-zinc-900">
            Jours exceptionnellement fermés
          </p>
          <p className="mb-3 text-xs text-zinc-500">
            En plus des week-ends — utile quand le calendrier officiel des
            vacances compte encore un jour comme fermé alors que le centre a
            déjà rouvert (ex: rentrée un lundi).
          </p>
          {joursFermeture.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {joursFermeture.map((f) => (
                <span
                  key={f.id}
                  className="flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700"
                >
                  {f.date}
                  {f.motif && ` · ${f.motif}`}
                  <button
                    onClick={() => supprimerFermeture(f.id)}
                    className="text-zinc-400 hover:text-red-600"
                    title="Supprimer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <form onSubmit={ajouterFermeture} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs text-zinc-500">Date</label>
              <input
                type="date"
                required
                value={formFermeture.date}
                onChange={(e) =>
                  setFormFermeture({ ...formFermeture, date: e.target.value })
                }
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Motif (optionnel)</label>
              <input
                placeholder="Ex: Rentrée scolaire"
                value={formFermeture.motif}
                onChange={(e) =>
                  setFormFermeture({ ...formFermeture, motif: e.target.value })
                }
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              + Ajouter
            </button>
          </form>
        </div>
      )}

      <div className="no-print">
        <PeriodesVacances periodes={periodes} zone={zone} loading={loadingVacances} />
      </div>

      {loadingVacances || periodeIndex === null ? (
        <p className="text-sm text-zinc-400">Chargement...</p>
      ) : periodes.length === 0 ? (
        <p className="text-sm text-zinc-400">Aucune période de vacances trouvée.</p>
      ) : (
        <>
          <div className="no-print">
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
          {periode && (
            <p className="hidden print:block print:text-center print:text-sm print:font-medium">
              {periode.description} · {periode.debut} – {periode.fin}
            </p>
          )}

          {semaines.length > 0 && (
            <div className="no-print flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Semaine
                </p>
                <select
                  value={semaineIndexSafe}
                  onChange={(e) => setSemaineIndex(Number(e.target.value))}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                >
                  {semaines.map((s, i) => (
                    <option key={s[0]} value={i}>
                      Semaine {i + 1} ({formatJourCourt(s[0])} – {formatJourCourt(s[s.length - 1])})
                    </option>
                  ))}
                </select>
              </div>
              {!monGroupe && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Groupe
                  </p>
                  <select
                    value={groupeSelectionne}
                    onChange={(e) => setGroupeSelectionne(e.target.value as Groupe)}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  >
                    {GROUPES.map((g) => (
                      <option key={g} value={g}>
                        {GROUPE_LABELS[g]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {editable && creneauOuverture && creneauFermeture && (
                <button
                  onClick={autoRepartirSemaine}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Répartir automatiquement toute la semaine
                </button>
              )}
            </div>
          )}

          {animateurs.length > 0 && (
            <div className="no-print rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="mb-4 text-sm font-semibold text-zinc-900">
                Heures · semaine {semaineIndexSafe + 1}
              </p>
              <div className="flex flex-col gap-3">
                {animateurs.map((a) => {
                  const mineur = estMineur(a.date_naissance, finSemaineSelectionnee);
                  const plafond = plafondHeuresSemaine(mineur);
                  const total = heuresSemaineParAnimateur.get(a.id) ?? 0;
                  const ratio = plafond > 0 ? total / plafond : 0;
                  const horsTolerance =
                    animateursActifsSemaine.has(a.id) && Math.abs(total - plafond) > 1;
                  const couleur = horsTolerance
                    ? "bg-red-500"
                    : ratio > 0.8
                      ? "bg-amber-500"
                      : "bg-emerald-500";
                  return (
                    <div key={a.id} className="flex items-center gap-3">
                      <span className="w-36 shrink-0 truncate text-sm font-medium text-zinc-800">
                        {a.prenom} {a.nom}
                      </span>
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className={`h-full rounded-full ${couleur}`}
                          style={{ width: `${Math.min(100, ratio * 100)}%` }}
                        />
                      </div>
                      <span
                        className={`w-28 shrink-0 text-right text-sm font-semibold ${
                          horsTolerance ? "text-red-600" : "text-zinc-700"
                        }`}
                      >
                        {formatHeures(total)}{" "}
                        <span className="text-xs font-normal text-zinc-400">
                          / {plafond}h
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-xs text-zinc-400">
                Quota hebdomadaire visé : 38h pour les mineurs, 43h pour les
                majeurs (majeur appliqué par défaut si la date de naissance
                n&apos;est pas renseignée) — tolérance de ±1h avant alerte.
              </p>
            </div>
          )}

          {alertes.length > 0 && (
            <div className="no-print rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="mb-3 text-sm font-semibold text-red-800">
                ⚠️ {alertes.length} alerte{alertes.length > 1 ? "s" : ""} · semaine{" "}
                {semaineIndexSafe + 1}
              </p>
              <div className="flex flex-col gap-3">
                {(Object.keys(CATEGORIE_ALERTE_INFO) as CategorieAlerte[])
                  .filter((cat) => (alertesParCategorie.get(cat)?.length ?? 0) > 0)
                  .map((cat) => (
                    <div key={cat}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-700">
                        {CATEGORIE_ALERTE_INFO[cat].icone} {CATEGORIE_ALERTE_INFO[cat].titre}{" "}
                        <span className="font-normal opacity-70">
                          ({alertesParCategorie.get(cat)?.length})
                        </span>
                      </p>
                      <ul className="flex flex-col gap-0.5 text-sm text-red-700">
                        {alertesParCategorie.get(cat)?.map((texte, i) => (
                          <li key={i}>• {texte}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-zinc-400">Chargement...</p>
          ) : creneaux.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Aucun créneau défini. {editable && "Clique \"Gérer les créneaux\" pour en créer."}
            </p>
          ) : (
            <div className="flex flex-col gap-6 print:gap-0">
              {groupesGeres.map((groupe) =>
                semaines.map((semaineJours, semaineIdx) => (
                  <div
                    key={`${groupe}-${semaineJours[0]}`}
                    className={`print-page ${
                      semaineIdx === semaineIndexSafe && groupe === groupeSelectionne
                        ? ""
                        : "hidden print:block"
                    }`}
                  >
                    <p className="rounded-t-xl border border-b-0 border-zinc-300 bg-zinc-100 py-2 text-center text-sm font-bold uppercase tracking-wide text-zinc-700 print:rounded-none print:border-black print:bg-gray-200 print:text-base">
                      {GROUPE_LABELS[groupe]}
                      <span className="ml-2 font-normal normal-case text-zinc-500">
                        · semaine {semaineIdx + 1} du {formatJourCourt(semaineJours[0])}
                      </span>
                    </p>
                    <div className="overflow-x-auto rounded-b-xl border border-zinc-300 bg-white shadow-sm print:overflow-visible print:rounded-none print:border-black print:shadow-none">
                      <table className="w-full border-collapse text-left text-sm print:text-xs">
                        <thead>
                          <tr>
                            <th className="sticky left-0 z-10 border border-zinc-300 bg-zinc-50 px-2 py-2 font-medium print:static print:border-black" />
                            <th className="sticky left-10 z-10 border border-zinc-300 border-r-2 border-r-zinc-400 bg-zinc-50 px-3 py-2 font-medium print:static print:border-black print:border-r-2">
                              Créneau
                            </th>
                            {semaineJours.map((j) => (
                              <th
                                key={j}
                                className="border border-zinc-300 bg-zinc-50 px-2 py-2 text-center font-bold capitalize print:border-black"
                              >
                                {formatJourCourt(j)}
                              </th>
                            ))}
                          </tr>
                          <tr className="no-print">
                            <th
                              colSpan={2}
                              className="sticky left-0 z-10 border border-zinc-300 border-r-2 border-r-zinc-400 bg-white px-3 py-2 text-left text-xs font-medium text-zinc-500"
                            >
                              Effectif enfants
                            </th>
                            {semaineJours.map((j) => {
                              const requis = editable ? nbRequisEncadrement(groupe, j) : null;
                              return (
                                <th
                                  key={j}
                                  className="border border-zinc-300 bg-white px-2 py-2 text-center font-normal"
                                >
                                  {editable ? (
                                    <input
                                      type="number"
                                      min={0}
                                      defaultValue={effectifDe(groupe, j) ?? ""}
                                      onBlur={(e) => {
                                        const v = Number(e.target.value);
                                        if (!Number.isNaN(v)) majEffectif(groupe, j, v);
                                      }}
                                      className="w-14 rounded-md border border-zinc-300 px-1 py-0.5 text-center text-xs"
                                    />
                                  ) : (
                                    <span className="text-xs text-zinc-500">
                                      {effectifDe(groupe, j) ?? "—"}
                                    </span>
                                  )}
                                  {requis && (
                                    <p className="mt-0.5 text-[10px] text-zinc-400">
                                      {requis} requis
                                    </p>
                                  )}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {TYPES.flatMap((type) => {
                            const lignes = creneaux.filter((c) => c.type === type);
                            return lignes.map((c, idx) => (
                              <tr
                                key={c.id}
                                className={
                                  type === "pause"
                                    ? "bg-zinc-100 print:bg-gray-200"
                                    : "bg-white"
                                }
                              >
                                {idx === 0 && (
                                  <td
                                    rowSpan={lignes.length}
                                    className="sticky left-0 z-10 border border-zinc-300 bg-zinc-50 px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500 print:static print:border-black print:bg-gray-200"
                                    style={{ writingMode: "vertical-rl" }}
                                  >
                                    <span className="inline-block rotate-180">
                                      {TYPE_CRENEAU_LABELS[type]}
                                    </span>
                                  </td>
                                )}
                                <td className="sticky left-10 z-10 whitespace-nowrap border border-zinc-300 border-r-2 border-r-zinc-400 bg-inherit px-3 py-2 font-bold text-zinc-900 print:static print:border-black print:border-r-2">
                                  {c.libelle}
                                </td>
                                {semaineJours.map((j) => {
                                  const eligibles = animateursDuGroupe(groupe, j);
                                  const ids = animateursDe(c.id, j).filter((id) =>
                                    eligibles.includes(id)
                                  );
                                  const noms = ids
                                    .map((id) => animateurs.find((a) => a.id === id))
                                    .filter(Boolean)
                                    .map((a) => a!.prenom);
                                  const estCritique =
                                    c.id === creneauOuverture?.id ||
                                    c.id === creneauFermeture?.id;
                                  const alerteStagiaire =
                                    estCritique && stagiaireSeul(c.id, j, groupe);
                                  const alerteEffectif =
                                    estCritique && encadrementInsuffisant(c.id, j, groupe);
                                  const alerte = alerteStagiaire || alerteEffectif;
                                  return (
                                    <td
                                      key={j}
                                      onClick={() =>
                                        editable &&
                                        setCelluleOuverte({ creneauId: c.id, date: j, groupe })
                                      }
                                      title={
                                        alerteStagiaire
                                          ? "Uniquement des stagiaires — un stagiaire ne peut pas ouvrir/fermer seul"
                                          : alerteEffectif
                                            ? `Effectif insuffisant : ${nbRequisEncadrement(groupe, j)} animateur(s) requis selon l'effectif du jour`
                                            : undefined
                                      }
                                      className={`min-w-24 px-2 py-2 text-center text-xs text-zinc-700 print:border-black ${
                                        alerte
                                          ? "border-2 border-red-500 bg-red-50 print:border-red-600"
                                          : "border border-zinc-300"
                                      } ${editable ? "cursor-pointer hover:bg-zinc-50/60" : ""}`}
                                    >
                                      {noms.length > 0 ? (
                                        noms.join(" / ")
                                      ) : editable ? (
                                        <span className="print:hidden">+</span>
                                      ) : (
                                        ""
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ));
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

        </>
      )}

      {celluleOuverte && (
        <div
          className="no-print fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4"
          onClick={() => setCelluleOuverte(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-900">
                {GROUPE_LABELS[celluleOuverte.groupe]} ·{" "}
                {creneaux.find((c) => c.id === celluleOuverte.creneauId)?.libelle} ·{" "}
                {formatJourCourt(celluleOuverte.date)}
              </p>
              <button
                onClick={() => setCelluleOuverte(null)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                ✕
              </button>
            </div>
            {(() => {
              const eligibles = animateursDuGroupe(
                celluleOuverte.groupe,
                celluleOuverte.date
              );
              if (eligibles.length === 0) {
                return (
                  <p className="text-sm text-zinc-500">
                    Aucun animateur affecté au groupe {GROUPE_LABELS[celluleOuverte.groupe]}{" "}
                    ce jour-là. Commence par la page{" "}
                    <Link href="/dashboard/repartition" className="underline">
                      Répartition
                    </Link>
                    .
                  </p>
                );
              }
              return (
                <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                  {animateurs
                    .filter((a) => eligibles.includes(a.id))
                    .map((a) => {
                      const assigne = animateursDe(
                        celluleOuverte.creneauId,
                        celluleOuverte.date
                      ).includes(a.id);
                      return (
                        <label
                          key={a.id}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50"
                        >
                          <input
                            type="checkbox"
                            checked={assigne}
                            onChange={(e) =>
                              toggleAffectation(
                                celluleOuverte.creneauId,
                                celluleOuverte.date,
                                a.id,
                                e.target.checked
                              )
                            }
                          />
                          {a.prenom} {a.nom}
                        </label>
                      );
                    })}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
