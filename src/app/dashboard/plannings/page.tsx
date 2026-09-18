"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { useVacances } from "@/lib/use-vacances";
import { estWeekend, joursDe, periodeEnCours, semainesDe } from "@/lib/vacances";
import { formatHeures, heuresJour, pauseMinutes } from "@/lib/creneaux";
import { estMineur, plafondHeuresSemaine } from "@/lib/regles";
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
  type Groupe,
  type JourFermeture,
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
    const [{ data: c }, { data: j }] = await Promise.all([
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
    ]);
    setAffectations((c as AffectationCreneau[]) ?? []);
    setAffectationsJour((j as AffectationJour[]) ?? []);
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
    return ids.every(
      (id) => animateurs.find((a) => a.id === id)?.est_stagiaire
    );
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
    for (const groupe of GROUPES) {
      for (const j of semaineJoursSelectionnee) {
        for (const id of animateursDuGroupe(groupe, j)) ids.add(id);
      }
    }
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semaineKey, animateursParGroupeJour]);

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

  async function autoRepartirOuvertureFermeture() {
    if (!creneauOuverture || !creneauFermeture) {
      setErreur("Il faut au moins un créneau d'arrivée et un créneau de départ définis.");
      return;
    }
    if (semaineJoursSelectionnee.length === 0) return;
    if (
      !confirm(
        "Ça va remplacer les affectations actuelles des créneaux d'ouverture " +
          `(${creneauOuverture.libelle}) et de fermeture (${creneauFermeture.libelle}) ` +
          "pour cette semaine — les autres créneaux ne sont pas touchés. Continuer ?"
      )
    )
      return;

    const compteurOuverture = new Map<string, number>();
    const compteurFermeture = new Map<string, number>();

    function choisir(eligibles: string[], compteur: Map<string, number>) {
      if (eligibles.length === 0) return null;
      const nonStagiaires = eligibles.filter(
        (id) => !animateurs.find((a) => a.id === id)?.est_stagiaire
      );
      const pool = nonStagiaires.length > 0 ? nonStagiaires : eligibles;
      return pool.reduce((meilleur, id) =>
        (compteur.get(id) ?? 0) < (compteur.get(meilleur) ?? 0) ? id : meilleur
      );
    }

    const nouvelles: { date: string; creneau_id: string; animateur_id: string }[] = [];

    for (const groupe of GROUPES) {
      for (const j of semaineJoursSelectionnee) {
        const eligibles = animateursDuGroupe(groupe, j);
        if (eligibles.length === 0) continue;

        const opener = choisir(eligibles, compteurOuverture);
        if (opener) {
          compteurOuverture.set(opener, (compteurOuverture.get(opener) ?? 0) + 1);
          nouvelles.push({ date: j, creneau_id: creneauOuverture.id, animateur_id: opener });
        }

        const closer = choisir(eligibles, compteurFermeture);
        if (closer) {
          compteurFermeture.set(closer, (compteurFermeture.get(closer) ?? 0) + 1);
          nouvelles.push({ date: j, creneau_id: creneauFermeture.id, animateur_id: closer });
        }
      }
    }

    setErreur(null);

    const { error: errDel } = await supabase
      .from("affectations_creneau")
      .delete()
      .in("creneau_id", [creneauOuverture.id, creneauFermeture.id])
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

  // Récapitulatif texte des alertes de la semaine affichée.
  const alertes = useMemo(() => {
    const liste: string[] = [];

    for (const groupe of GROUPES) {
      for (const j of semaineJoursSelectionnee) {
        if (creneauOuverture && stagiaireSeul(creneauOuverture.id, j, groupe)) {
          liste.push(
            `${GROUPE_LABELS[groupe]} · ${formatJourCourt(j)} : uniquement des stagiaires à l'ouverture (${creneauOuverture.libelle})`
          );
        }
        if (creneauFermeture && stagiaireSeul(creneauFermeture.id, j, groupe)) {
          liste.push(
            `${GROUPE_LABELS[groupe]} · ${formatJourCourt(j)} : uniquement des stagiaires à la fermeture (${creneauFermeture.libelle})`
          );
        }
      }
    }

    for (const a of animateurs) {
      for (const j of semaineJoursSelectionnee) {
        if (violationsPause.has(`${a.id}|${j}`)) {
          liste.push(
            `${a.prenom} ${a.nom} · ${formatJourCourt(j)} : pause inférieure à 1h`
          );
        }
      }
      const mineur = estMineur(a.date_naissance, finSemaineSelectionnee);
      const plafond = plafondHeuresSemaine(mineur);
      const total = heuresSemaineParAnimateur.get(a.id) ?? 0;
      if (total > plafond) {
        liste.push(
          `${a.prenom} ${a.nom} : ${formatHeures(total)} cette semaine, au-delà du plafond ${
            mineur ? "mineur" : "majeur"
          } (${plafond}h)`
        );
      }

      if (animateursActifsSemaine.has(a.id)) {
        const nbOuvertures = compteursOF.ouvertures.get(a.id) ?? 0;
        const nbFermetures = compteursOF.fermetures.get(a.id) ?? 0;
        if (nbOuvertures === 0) {
          liste.push(`${a.prenom} ${a.nom} : n'ouvre jamais cette semaine (minimum 1 fois)`);
        } else if (nbOuvertures > 2) {
          liste.push(`${a.prenom} ${a.nom} : ouvre ${nbOuvertures} fois cette semaine (maximum 2)`);
        }
        if (nbFermetures === 0) {
          liste.push(`${a.prenom} ${a.nom} : ne ferme jamais cette semaine (minimum 1 fois)`);
        } else if (nbFermetures > 2) {
          liste.push(`${a.prenom} ${a.nom} : ferme ${nbFermetures} fois cette semaine (maximum 2)`);
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
  ]);

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
        </div>
      </div>

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
              {editable && creneauOuverture && creneauFermeture && (
                <button
                  onClick={autoRepartirOuvertureFermeture}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Répartir automatiquement ouverture/fermeture
                </button>
              )}
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
              {GROUPES.map((groupe) =>
                semaines.map((semaineJours, semaineIdx) => (
                  <div
                    key={`${groupe}-${semaineJours[0]}`}
                    className={`print-page ${
                      semaineIdx === semaineIndexSafe ? "" : "hidden print:block"
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
                            <th className="sticky left-10 z-10 border border-zinc-300 bg-zinc-50 px-3 py-2 font-medium print:static print:border-black">
                              Créneau
                            </th>
                            {semaineJours.map((j) => (
                              <th
                                key={j}
                                className="border border-zinc-300 bg-zinc-50 px-2 py-2 text-center font-medium capitalize print:border-black"
                              >
                                {formatJourCourt(j)}
                              </th>
                            ))}
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
                                <td className="sticky left-10 z-10 whitespace-nowrap border border-zinc-300 bg-inherit px-3 py-2 font-medium text-zinc-900 print:static print:border-black">
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
                                  const alerte =
                                    estCritique && stagiaireSeul(c.id, j, groupe);
                                  return (
                                    <td
                                      key={j}
                                      onClick={() =>
                                        editable &&
                                        setCelluleOuverte({ creneauId: c.id, date: j, groupe })
                                      }
                                      title={
                                        alerte
                                          ? "Uniquement des stagiaires — un stagiaire ne peut pas ouvrir/fermer seul"
                                          : undefined
                                      }
                                      className={`min-w-24 px-2 py-2 text-center text-xs text-zinc-700 print:border-black ${
                                        alerte
                                          ? "border-2 border-red-500 bg-red-50 print:border-red-600"
                                          : "border border-zinc-300"
                                      } ${editable ? "cursor-pointer hover:bg-zinc-50/60" : ""}`}
                                    >
                                      {noms.length > 0 ? noms.join(" / ") : editable ? "+" : ""}
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

          {alertes.length > 0 && (
            <div className="no-print rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="mb-2 text-sm font-medium text-red-800">
                ⚠️ Alertes · semaine {semaineIndexSafe + 1}
              </p>
              <ul className="flex flex-col gap-1 text-sm text-red-700">
                {alertes.map((a, i) => (
                  <li key={i}>• {a}</li>
                ))}
              </ul>
            </div>
          )}

          {animateurs.length > 0 && (
            <div className="no-print rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-medium text-zinc-900">
                Heures · semaine {semaineIndexSafe + 1}
              </p>
              <div className="flex flex-wrap gap-2">
                {animateurs.map((a) => {
                  const mineur = estMineur(a.date_naissance, finSemaineSelectionnee);
                  const plafond = plafondHeuresSemaine(mineur);
                  const total = heuresSemaineParAnimateur.get(a.id) ?? 0;
                  const depasse = total > plafond;
                  return (
                    <span
                      key={a.id}
                      className={`rounded-full px-3 py-1 text-xs ${
                        depasse
                          ? "bg-red-100 text-red-700"
                          : "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      {a.prenom} {a.nom} ·{" "}
                      <span className="font-semibold">{formatHeures(total)}</span>
                      <span className="text-[10px] opacity-70"> /{plafond}h max</span>
                    </span>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-zinc-400">
                Plafond légal hebdomadaire : 38h pour les mineurs, 43h pour
                les majeurs (majeur appliqué par défaut si la date de
                naissance n&apos;est pas renseignée).
              </p>
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
