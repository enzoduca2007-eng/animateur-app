"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { useVacances } from "@/lib/use-vacances";
import { estWeekend, joursDe, periodeEnCours, semainesDe } from "@/lib/vacances";
import { formatHeures, heuresJour, toMinutes } from "@/lib/creneaux";
import { PeriodesVacances } from "@/components/periodes-vacances";
import { PointageJour } from "@/components/pointage-jour";
import {
  canManage,
  GROUPE_LABELS,
  MOMENTS_ACTIVITE,
  TYPE_ACTIVITE_EMOJIS,
  TYPE_ACTIVITE_LABELS,
  type AffectationCreneau,
  type AffectationJour,
  type Animateur,
  type Creneau,
  type FeuilleTemps,
  type FicheAnimation,
  type Groupe,
  type JourFermeture,
  type MomentActivite,
  type PlanningActivite,
  type PublicationPlanningSemaine,
} from "@/lib/types";

const COULEUR_GROUPE: Record<Groupe, string> = {
  lutins: "bg-sky-100 text-sky-700",
  trolls: "bg-emerald-100 text-emerald-700",
};

function formatJourLong(dateISO: string) {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

// Génération d'un fichier .ics (iCalendar) pour exporter le planning
// personnel vers un calendrier (Google/Apple/Outlook...) — dates/heures
// "flottantes" (pas de fuseau explicite), un événement par jour affecté.
function dateHeureIcs(dateISO: string, heureHHMMSS: string) {
  const [h, m] = heureHHMMSS.split(":");
  return `${dateISO.replace(/-/g, "")}T${h}${m}00`;
}

function dateIcs(dateISO: string) {
  return dateISO.replace(/-/g, "");
}

function jourSuivantIso(dateISO: string) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function echapperIcs(texte: string) {
  return texte
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

function TimelineJour({ creneaux }: { creneaux: Creneau[] }) {
  const arrivees = creneaux.filter((c) => c.type === "arrivee");
  const departs = creneaux.filter((c) => c.type === "depart");
  const pauses = creneaux.filter((c) => c.type === "pause" && c.heure_fin);
  if (arrivees.length === 0 || departs.length === 0) return null;

  const debut = Math.min(...arrivees.map((c) => toMinutes(c.heure_debut)));
  const fin = Math.max(...departs.map((c) => toMinutes(c.heure_debut)));
  const span = Math.max(1, fin - debut);
  const arrivee = arrivees.reduce((min, c) =>
    toMinutes(c.heure_debut) < toMinutes(min.heure_debut) ? c : min
  );
  const depart = departs.reduce((max, c) =>
    toMinutes(c.heure_debut) > toMinutes(max.heure_debut) ? c : max
  );

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3 text-sm">
        <span className="flex items-center gap-1 font-medium text-emerald-700">
          🌅 {arrivee.libelle}
        </span>
        <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-emerald-100">
          {pauses.map((p) => {
            const pDebut = toMinutes(p.heure_debut);
            const pFin = toMinutes(p.heure_fin!);
            const left = ((pDebut - debut) / span) * 100;
            const largeur = ((pFin - pDebut) / span) * 100;
            return (
              <div
                key={p.id}
                className="absolute inset-y-0 bg-amber-300"
                style={{
                  left: `${Math.max(0, left)}%`,
                  width: `${Math.max(0, largeur)}%`,
                }}
              />
            );
          })}
        </div>
        <span className="flex items-center gap-1 font-medium text-indigo-700">
          🌇 {depart.libelle}
        </span>
      </div>
      {pauses.length > 0 && (
        <p className="mt-1 text-right text-xs text-amber-600">
          ☕ pause : {pauses.map((p) => p.libelle).join(", ")}
        </p>
      )}
    </div>
  );
}

export default function MonPlanningPage() {
  const profile = useProfile();
  const supabase = createClient();
  const { periodes, zone, loading: loadingVacances } = useVacances();

  const [moi, setMoi] = useState<Animateur | null | undefined>(undefined);
  const [animateurs, setAnimateurs] = useState<Animateur[]>([]);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [affectations, setAffectations] = useState<AffectationCreneau[]>([]);
  const [affectationsJour, setAffectationsJour] = useState<AffectationJour[]>([]);
  const [activites, setActivites] = useState<PlanningActivite[]>([]);
  const [fichesAnimation, setFichesAnimation] = useState<FicheAnimation[]>([]);
  const [joursFermeture, setJoursFermeture] = useState<JourFermeture[]>([]);
  const [feuilles, setFeuilles] = useState<FeuilleTemps[]>([]);
  const [periodeIndex, setPeriodeIndex] = useState<number | null>(null);
  const [jourIndex, setJourIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ficheOuverte, setFicheOuverte] = useState<string | null>(null);
  const [publications, setPublications] = useState<PublicationPlanningSemaine[]>([]);

  useEffect(() => {
    supabase
      .from("animateurs")
      .select("*")
      .eq("profile_id", profile.id)
      .maybeSingle()
      .then(({ data }) => {
        setMoi((data as Animateur) ?? null);
      });
    supabase
      .from("animateurs")
      .select("*")
      .eq("statut", "actif")
      .then(({ data }) => {
        if (data) setAnimateurs(data as Animateur[]);
      });
    supabase
      .from("creneaux")
      .select("*")
      .then(({ data }) => {
        if (data) setCreneaux(data as Creneau[]);
      });
    supabase
      .from("jours_fermeture")
      .select("*")
      .then(({ data }) => {
        if (data) setJoursFermeture(data as JourFermeture[]);
      });
    supabase
      .from("plannings_publications")
      .select("*")
      .then(({ data }) => {
        if (data) setPublications(data as PublicationPlanningSemaine[]);
      });
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
  const joursOuvres = useMemo(
    () => jours.filter((j) => !estWeekend(j) && !joursFermesSet.has(j)),
    [jours, joursFermesSet]
  );

  const semaines = useMemo(() => semainesDe(joursOuvres), [joursOuvres]);
  const semainesPubliees = useMemo(
    () => new Set(publications.map((p) => p.semaine_debut)),
    [publications]
  );
  // Un animateur/responsable ne voit son planning que pour les semaines
  // publiées par la direction ; celle-ci le voit toujours (même en
  // préparation, avant publication).
  function semainePublieePour(date: string) {
    if (canManage(profile.role)) return true;
    const semaine = semaines.find((s) => s.includes(date));
    return !!semaine && semainesPubliees.has(semaine[0]);
  }

  async function chargerFeuilles() {
    if (!moi || !periode) return;
    const { data } = await supabase
      .from("feuilles_temps")
      .select("*")
      .eq("animateur_id", moi.id)
      .gte("date", periode.debut)
      .lte("date", periode.fin);
    setFeuilles((data as FeuilleTemps[]) ?? []);
  }

  useEffect(() => {
    if (!moi || !periode) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    Promise.all([
      supabase
        .from("affectations_creneau")
        .select("*")
        .eq("animateur_id", moi.id)
        .gte("date", periode.debut)
        .lte("date", periode.fin),
      supabase
        .from("affectations_jour")
        .select("*")
        .eq("animateur_id", moi.id)
        .gte("date", periode.debut)
        .lte("date", periode.fin),
      supabase
        .from("feuilles_temps")
        .select("*")
        .eq("animateur_id", moi.id)
        .gte("date", periode.debut)
        .lte("date", periode.fin),
      supabase
        .from("planning_activites")
        .select("*")
        .gte("date", periode.debut)
        .lte("date", periode.fin)
        .order("ordre"),
    ]).then(([{ data: c }, { data: j }, { data: f }, { data: pa }]) => {
      setAffectations((c as AffectationCreneau[]) ?? []);
      setAffectationsJour((j as AffectationJour[]) ?? []);
      setFeuilles((f as FeuilleTemps[]) ?? []);
      setActivites((pa as PlanningActivite[]) ?? []);
      setLoading(false);
      setJourIndex(0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moi, periode]);

  useEffect(() => {
    const idsGrandJeu = activites
      .filter((a) => a.type_activite === "grand_jeu")
      .map((a) => a.id);
    if (idsGrandJeu.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFichesAnimation([]);
      return;
    }
    supabase
      .from("fiches_animation")
      .select("*")
      .in("planning_activite_id", idsGrandJeu)
      .then(({ data }) => {
        setFichesAnimation((data as FicheAnimation[]) ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activites]);

  function ficheDe(activiteId: string) {
    return fichesAnimation.find((f) => f.planning_activite_id === activiteId);
  }

  async function majFicheAnimation(
    activiteId: string,
    updates: Partial<
      Pick<
        FicheAnimation,
        | "age"
        | "effectif"
        | "lieu"
        | "objectifs"
        | "sensibilisation"
        | "deroulement"
        | "conclusion_rangement"
        | "animateurs_requis"
      >
    >
  ) {
    const existante = ficheDe(activiteId);
    const payload = {
      age: existante?.age ?? null,
      effectif: existante?.effectif ?? null,
      lieu: existante?.lieu ?? null,
      objectifs: existante?.objectifs ?? null,
      sensibilisation: existante?.sensibilisation ?? null,
      deroulement: existante?.deroulement ?? null,
      conclusion_rangement: existante?.conclusion_rangement ?? null,
      animateurs_requis: existante?.animateurs_requis ?? null,
      ...updates,
    };

    setFichesAnimation((prev) => [
      ...prev.filter((f) => f.planning_activite_id !== activiteId),
      {
        id: existante?.id ?? `optimistic-${activiteId}`,
        planning_activite_id: activiteId,
        created_by: profile.id,
        created_at: existante?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...payload,
      },
    ]);

    const { error } = await supabase
      .from("fiches_animation")
      .upsert(
        { planning_activite_id: activiteId, created_by: profile.id, ...payload },
        { onConflict: "planning_activite_id" }
      );
    if (error) setErreur(error.message);
  }

  async function majDuree(activiteId: string, valeur: string) {
    setActivites((prev) =>
      prev.map((a) => (a.id === activiteId ? { ...a, duree: valeur || null } : a))
    );
    await supabase
      .from("planning_activites")
      .update({ duree: valeur || null })
      .eq("id", activiteId);
  }

  async function majFeuille(
    date: string,
    updates: Partial<
      Pick<
        FeuilleTemps,
        "present" | "motif_absence" | "heure_arrivee_reelle" | "heure_depart_reelle"
      >
    >
  ) {
    if (!moi || profile.role === "animateur") return;
    setErreur(null);
    const existante = feuilles.find((f) => f.date === date);
    const payload = {
      present: existante?.present ?? true,
      motif_absence: existante?.motif_absence ?? null,
      heure_arrivee_reelle: existante?.heure_arrivee_reelle ?? null,
      heure_depart_reelle: existante?.heure_depart_reelle ?? null,
      ...updates,
    };

    setFeuilles((prev) => [
      ...prev.filter((f) => f.date !== date),
      {
        id: existante?.id ?? `optimistic-${date}`,
        date,
        animateur_id: moi.id,
        commentaire: existante?.commentaire ?? null,
        created_by: profile.id,
        created_at: existante?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...payload,
      },
    ]);

    const { error } = await supabase
      .from("feuilles_temps")
      .upsert(
        { date, animateur_id: moi.id, created_by: profile.id, ...payload },
        { onConflict: "etablissement_id,date,animateur_id" }
      );
    if (error) {
      setErreur(error.message);
      chargerFeuilles();
    }
  }

  const totalHeures = useMemo(() => {
    let total = 0;
    for (const j of joursOuvres) {
      const ids = new Set(
        affectations.filter((a) => a.date === j).map((a) => a.creneau_id)
      );
      const assignes = creneaux.filter((c) => ids.has(c.id));
      const h = heuresJour(assignes);
      if (h) total += h;
    }
    return total;
  }, [joursOuvres, affectations, creneaux]);

  const joursTravailles = useMemo(
    () =>
      joursOuvres.filter(
        (j) =>
          affectations.some((a) => a.date === j) ||
          affectationsJour.some((a) => a.date === j)
      ),
    [joursOuvres, affectations, affectationsJour]
  );

  function nomsDe(ids: string[]) {
    return ids
      .map((id) => animateurs.find((a) => a.id === id))
      .filter((a): a is Animateur => !!a)
      .map((a) => a.prenom);
  }

  function activitesDuJour(date: string, groupe: Groupe | undefined, moment: MomentActivite) {
    if (!groupe) return [];
    return activites
      .filter((a) => a.groupe === groupe && a.date === date && a.moment === moment)
      .sort((a, b) => a.ordre - b.ordre);
  }

  // Exporte tous les jours affectés de la période en fichier .ics, pour
  // les ajouter au calendrier personnel (Google/Apple/Outlook...).
  function telechargerCalendrier() {
    if (!moi) return;
    const maintenant =
      new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    const lignes = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AnimTaStructure//FR", "CALSCALE:GREGORIAN"];

    for (const j of joursTravailles) {
      const idsCreneaux = new Set(
        affectations.filter((a) => a.date === j).map((a) => a.creneau_id)
      );
      const assignesJour = creneaux.filter((c) => idsCreneaux.has(c.id));
      const arrivees = assignesJour.filter((c) => c.type === "arrivee");
      const departs = assignesJour.filter((c) => c.type === "depart");
      const groupe = affectationsJour.find((a) => a.date === j)?.groupe;

      const descriptionLignes: string[] = [];
      if (groupe) descriptionLignes.push(`Groupe : ${GROUPE_LABELS[groupe]}`);
      for (const m of MOMENTS_ACTIVITE) {
        const mesActs = activitesDuJour(j, groupe, m.cle).filter((act) =>
          act.animateur_ids.includes(moi.id)
        );
        if (mesActs.length > 0) {
          descriptionLignes.push(`${m.label} : ${mesActs.map((a) => a.libelle).join(", ")}`);
        }
      }

      lignes.push("BEGIN:VEVENT");
      lignes.push(`UID:${j}-${moi.id}@animateur-app`);
      lignes.push(`DTSTAMP:${maintenant}`);

      if (arrivees.length > 0 && departs.length > 0) {
        const arrivee = arrivees.reduce((min, c) => (c.heure_debut < min.heure_debut ? c : min));
        const depart = departs.reduce((max, c) => (c.heure_debut > max.heure_debut ? c : max));
        lignes.push(`DTSTART:${dateHeureIcs(j, arrivee.heure_debut)}`);
        lignes.push(`DTEND:${dateHeureIcs(j, depart.heure_debut)}`);
      } else {
        lignes.push(`DTSTART;VALUE=DATE:${dateIcs(j)}`);
        lignes.push(`DTEND;VALUE=DATE:${dateIcs(jourSuivantIso(j))}`);
      }

      lignes.push(
        `SUMMARY:${echapperIcs(groupe ? `Animation — ${GROUPE_LABELS[groupe]}` : "Animation")}`
      );
      if (descriptionLignes.length > 0) {
        lignes.push(`DESCRIPTION:${echapperIcs(descriptionLignes.join("\n"))}`);
      }
      lignes.push("END:VEVENT");
    }

    lignes.push("END:VCALENDAR");

    const blob = new Blob([lignes.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = `planning-${moi.prenom.toLowerCase()}.ics`;
    document.body.appendChild(lien);
    lien.click();
    document.body.removeChild(lien);
    URL.revokeObjectURL(url);
  }

  async function majMateriel(activiteId: string, valeur: string) {
    setActivites((prev) =>
      prev.map((a) => (a.id === activiteId ? { ...a, materiel: valeur || null } : a))
    );
    await supabase
      .from("planning_activites")
      .update({ materiel: valeur || null })
      .eq("id", activiteId);
  }

  if (moi === undefined) {
    return <p className="text-sm text-zinc-400">Chargement...</p>;
  }

  if (moi === null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-zinc-900">Mon planning</h1>
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Ton compte n&apos;est pas encore relié à une fiche animateur.
          Demande à un directeur de faire le lien depuis la page Animateurs
          (bouton &quot;Modifier&quot; sur ta fiche).
        </p>
      </div>
    );
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const jourIndexSafe = Math.min(jourIndex, Math.max(0, joursTravailles.length - 1));
  const jourCourant = joursTravailles[jourIndexSafe] ?? null;

  const activiteImprimee = activites.find((a) => a.id === ficheOuverte) ?? null;
  const ficheImprimee = activiteImprimee ? ficheDe(activiteImprimee.id) : null;

  return (
    <>
    <div className="no-print flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Mon planning</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {moi.prenom} {moi.nom}
        </p>
      </div>

      {erreur && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {erreur}
        </p>
      )}

      <PeriodesVacances periodes={periodes} zone={zone} loading={loadingVacances} />

      {loadingVacances || periodeIndex === null ? (
        <p className="text-sm text-zinc-400">Chargement...</p>
      ) : periodes.length === 0 ? (
        <p className="text-sm text-zinc-400">Aucune période de vacances trouvée.</p>
      ) : (
        <>
          <div>
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

          {loading ? (
            <p className="text-sm text-zinc-400">Chargement...</p>
          ) : (
            <>
              <div className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-gradient-to-r from-zinc-900 to-zinc-700 p-5 text-white shadow-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-300">
                    Total sur la période
                  </p>
                  <p className="mt-1 text-3xl font-bold">{formatHeures(totalHeures)}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs uppercase tracking-wide text-zinc-300">
                    Jours travaillés
                  </p>
                  <p className="mt-1 text-3xl font-bold">{joursTravailles.length}</p>
                </div>
              </div>

              {joursTravailles.length > 0 && (
                <button
                  type="button"
                  onClick={telechargerCalendrier}
                  className="self-start rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  📅 Ajouter mon planning à mon calendrier
                </button>
              )}

              {joursTravailles.length === 0 || !jourCourant ? (
                <p className="text-sm text-zinc-400">
                  Aucune affectation sur cette période pour l&apos;instant.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setJourIndex((i) => Math.max(0, i - 1))}
                      disabled={jourIndexSafe === 0}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-30"
                    >
                      ← Jour précédent
                    </button>
                    <span className="text-xs text-zinc-400">
                      Jour {jourIndexSafe + 1} / {joursTravailles.length}
                    </span>
                    <button
                      onClick={() =>
                        setJourIndex((i) => Math.min(joursTravailles.length - 1, i + 1))
                      }
                      disabled={jourIndexSafe === joursTravailles.length - 1}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-30"
                    >
                      Jour suivant →
                    </button>
                  </div>

                  {(() => {
                    const j = jourCourant;
                    const idsJour = new Set(
                      affectations.filter((a) => a.date === j).map((a) => a.creneau_id)
                    );
                    const assignesJour = creneaux
                      .filter((c) => idsJour.has(c.id))
                      .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));
                    const groupe = affectationsJour.find((a) => a.date === j)?.groupe;
                    const heures = heuresJour(assignesJour);
                    const estAujourdhui = j === aujourdhui;
                    const publie = semainePublieePour(j);

                    if (!publie) {
                      return (
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-8 text-center shadow-sm">
                          <p className="text-lg font-bold capitalize text-zinc-900">
                            {formatJourLong(j)}
                          </p>
                          <p className="mt-3 text-sm font-medium text-zinc-500">
                            🚫 Planning non publié.
                          </p>
                          <p className="mt-1 text-xs text-zinc-400">
                            Reviens un peu plus tard.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div
                        className={`rounded-2xl border p-5 shadow-sm ${
                          estAujourdhui
                            ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900"
                            : "border-zinc-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            {estAujourdhui && (
                              <span className="mb-1 inline-block rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                Aujourd&apos;hui
                              </span>
                            )}
                            <p className="text-lg font-bold capitalize text-zinc-900">
                              {formatJourLong(j)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {groupe && (
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${COULEUR_GROUPE[groupe]}`}
                              >
                                {GROUPE_LABELS[groupe]}
                              </span>
                            )}
                            {heures !== null && (
                              <span className="rounded-full bg-zinc-900 px-3 py-1 text-sm font-bold text-white">
                                {formatHeures(heures)}
                              </span>
                            )}
                          </div>
                        </div>

                        {assignesJour.length > 0 ? (
                          <TimelineJour creneaux={assignesJour} />
                        ) : (
                          <p className="mt-3 text-xs text-zinc-400">
                            Affecté au groupe, pas encore d&apos;horaires précis.
                          </p>
                        )}

                        <div className="mt-4 flex flex-col gap-3">
                          {MOMENTS_ACTIVITE.map((m) => {
                            const acts = activitesDuJour(j, groupe, m.cle);
                            return (
                              <div
                                key={m.cle}
                                className="overflow-hidden rounded-xl border border-zinc-200"
                              >
                                <p className="bg-zinc-100 py-2 text-center text-sm font-bold uppercase tracking-wide text-zinc-600">
                                  {m.label}
                                </p>
                                <div className="p-3">
                                {acts.length === 0 ? (
                                  <p className="text-center text-sm text-zinc-300">
                                    Aucune activité
                                  </p>
                                ) : (
                                  <ul className="flex flex-col gap-2">
                                    {acts.map((act) => {
                                      const cAssigne = act.animateur_ids.includes(moi.id);
                                      return (
                                        <li
                                          key={act.id}
                                          className={`rounded-lg px-2 py-1.5 text-sm ${
                                            cAssigne
                                              ? "border-l-4 border-emerald-500 bg-white shadow-sm"
                                              : "text-zinc-500"
                                          }`}
                                        >
                                          <div className="flex items-start gap-1">
                                            {act.type_activite && (
                                              <span title={TYPE_ACTIVITE_LABELS[act.type_activite]}>
                                                {TYPE_ACTIVITE_EMOJIS[act.type_activite]}
                                              </span>
                                            )}
                                            <span
                                              className={`font-bold ${cAssigne ? "text-zinc-900" : ""}`}
                                            >
                                              {act.libelle}
                                            </span>
                                            {act.duree && (
                                              <span className="text-zinc-400">({act.duree})</span>
                                            )}
                                            {cAssigne && (
                                              <span className="ml-auto shrink-0 text-xs font-medium text-emerald-600">
                                                ✓ Toi
                                              </span>
                                            )}
                                          </div>
                                          {act.animateur_ids.length > 0 && (
                                            <p className="mt-0.5 text-xs text-zinc-500">
                                              → {nomsDe(act.animateur_ids).join(", ")}
                                            </p>
                                          )}
                                          {cAssigne && act.type_activite === "grand_jeu" && (
                                            <button
                                              type="button"
                                              onClick={() => setFicheOuverte(act.id)}
                                              className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-700 underline decoration-dotted"
                                            >
                                              📋 Fiche d&apos;animation
                                            </button>
                                          )}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <PointageJour
                          feuille={feuilles.find((f) => f.date === j) ?? null}
                          onChange={(updates) => majFeuille(j, updates)}
                          readOnly={profile.role === "animateur"}
                        />
                      </div>
                    );
                  })()}
                </>
              )}
            </>
          )}
        </>
      )}

      {ficheOuverte &&
        (() => {
          const act = activites.find((a) => a.id === ficheOuverte);
          if (!act) return null;
          const fiche = ficheDe(act.id);
          return (
            <div
              className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4 py-8"
              onClick={() => setFicheOuverte(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex max-h-full w-full max-w-lg flex-col overflow-y-auto rounded-xl bg-white p-5 shadow-lg"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-900">
                    📋 Fiche d&apos;animation — {act.libelle}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => window.print()}
                      title="Imprimer cette fiche"
                      className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                    >
                      🖨️
                    </button>
                    <button
                      onClick={() => setFicheOuverte(null)}
                      className="text-zinc-400 hover:text-zinc-700"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">Âge</label>
                      <input
                        defaultValue={fiche?.age ?? ""}
                        placeholder="ex. 6-8 ans"
                        onBlur={(e) => majFicheAnimation(act.id, { age: e.target.value || null })}
                        className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">Effectif</label>
                      <input
                        defaultValue={fiche?.effectif ?? ""}
                        placeholder="ex. 25"
                        onBlur={(e) =>
                          majFicheAnimation(act.id, { effectif: e.target.value || null })
                        }
                        className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">Lieu</label>
                      <input
                        defaultValue={fiche?.lieu ?? ""}
                        placeholder="ex. Extérieur"
                        onBlur={(e) => majFicheAnimation(act.id, { lieu: e.target.value || null })}
                        className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">Durée</label>
                      <input
                        defaultValue={act.duree ?? ""}
                        placeholder="ex. 1h30"
                        onBlur={(e) => majDuree(act.id, e.target.value)}
                        className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">Objectifs</label>
                    <textarea
                      defaultValue={fiche?.objectifs ?? ""}
                      onBlur={(e) =>
                        majFicheAnimation(act.id, { objectifs: e.target.value || null })
                      }
                      rows={2}
                      className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Matériel nécessaire / Coût
                    </label>
                    <textarea
                      defaultValue={act.materiel ?? ""}
                      onBlur={(e) => majMateriel(act.id, e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Sensibilisation / Aménagement
                    </label>
                    <textarea
                      defaultValue={fiche?.sensibilisation ?? ""}
                      onBlur={(e) =>
                        majFicheAnimation(act.id, { sensibilisation: e.target.value || null })
                      }
                      rows={2}
                      className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">Déroulement</label>
                    <textarea
                      defaultValue={fiche?.deroulement ?? ""}
                      onBlur={(e) =>
                        majFicheAnimation(act.id, { deroulement: e.target.value || null })
                      }
                      rows={5}
                      className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Conclusion / Rangement
                    </label>
                    <textarea
                      defaultValue={fiche?.conclusion_rangement ?? ""}
                      onBlur={(e) =>
                        majFicheAnimation(act.id, {
                          conclusion_rangement: e.target.value || null,
                        })
                      }
                      rows={2}
                      className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Animateurs requis
                    </label>
                    <textarea
                      defaultValue={fiche?.animateurs_requis ?? ""}
                      placeholder="ex. 1 animateur arbitre, 1 animateur par équipe"
                      onBlur={(e) =>
                        majFicheAnimation(act.id, { animateurs_requis: e.target.value || null })
                      }
                      rows={2}
                      className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>

    {/* Fiche d'animation imprimable, dans le style du modèle papier
        (cases titrées grisées) — visible uniquement à l'impression, pour
        la fiche actuellement ouverte. */}
    {activiteImprimee && (
      <div className="print-portrait hidden print:block">
        <div className="border border-black">
          <p className="border-b border-black bg-zinc-200 px-2 py-1 text-xs font-semibold">
            Nom de l&apos;activité
          </p>
          <p className="px-3 py-3 text-xl font-bold">{activiteImprimee.libelle}</p>
        </div>

        <div className="mt-3 grid grid-cols-4 border border-black">
          {(
            [
              ["Âge", ficheImprimee?.age],
              ["Effectif", ficheImprimee?.effectif],
              ["Lieu", ficheImprimee?.lieu],
              ["Durée", activiteImprimee.duree],
            ] as [string, string | null | undefined][]
          ).map(([label, valeur], idx) => (
            <div key={label} className={idx > 0 ? "border-l border-black" : ""}>
              <p className="border-b border-black bg-zinc-200 px-2 py-1 text-center text-xs font-semibold">
                {label}
              </p>
              <p className="px-2 py-3 text-center text-sm">{valeur || "—"}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 border border-black">
          <div>
            <p className="border-b border-black bg-zinc-200 px-2 py-1 text-center text-xs font-semibold">
              Objectifs
            </p>
            <p className="whitespace-pre-wrap px-3 py-3 text-sm">
              {ficheImprimee?.objectifs || "—"}
            </p>
          </div>
          <div className="border-l border-black">
            <p className="border-b border-black bg-zinc-200 px-2 py-1 text-center text-xs font-semibold">
              Matériel nécessaire / Coût
            </p>
            <p className="whitespace-pre-wrap px-3 py-3 text-sm">
              {activiteImprimee.materiel || "—"}
            </p>
          </div>
        </div>

        <div className="mt-3 border border-black">
          <p className="border-b border-black bg-zinc-200 px-2 py-1 text-center text-xs font-semibold">
            Sensibilisation / Aménagement
          </p>
          <p className="whitespace-pre-wrap px-3 py-3 text-sm">
            {ficheImprimee?.sensibilisation || "—"}
          </p>
        </div>

        <div className="mt-3 border border-black">
          <p className="border-b border-black bg-zinc-200 px-2 py-1 text-center text-xs font-semibold">
            Déroulement
          </p>
          <p className="min-h-32 whitespace-pre-wrap px-3 py-3 text-sm">
            {ficheImprimee?.deroulement || "—"}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 border border-black">
          <div>
            <p className="border-b border-black bg-zinc-200 px-2 py-1 text-center text-xs font-semibold">
              Conclusion / Rangement
            </p>
            <p className="whitespace-pre-wrap px-3 py-3 text-sm">
              {ficheImprimee?.conclusion_rangement || "—"}
            </p>
          </div>
          <div className="border-l border-black">
            <p className="border-b border-black bg-zinc-200 px-2 py-1 text-center text-xs font-semibold">
              Animateurs requis
            </p>
            <p className="whitespace-pre-wrap px-3 py-3 text-sm">
              {ficheImprimee?.animateurs_requis || "—"}
            </p>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
