"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { useVacances } from "@/lib/use-vacances";
import { estWeekend, joursDe, periodeEnCours, semainesDe } from "@/lib/vacances";
import {
  GROUPE_LABELS,
  type AffectationJour,
  type Animateur,
  type DirectionRoster,
  type EffectifJour,
  type EffectifSousGroupe,
  type Groupe,
  type Profile,
  type SectionDirection,
} from "@/lib/types";

// Lutins/Trolls/Géants à la saisie (L/T/G), mais Trolls et Géants
// partagent le même groupe réel "trolls" partout ailleurs dans
// l'application — sous_groupe est une étiquette purement visuelle,
// propre à cette page.
type Lettre = "L" | "T" | "G";

const CONFIG_PAR_LETTRE: Record<Lettre, { groupe: Groupe; sous_groupe: "trolls" | "geants" | null }> = {
  L: { groupe: "lutins", sous_groupe: null },
  T: { groupe: "trolls", sous_groupe: "trolls" },
  G: { groupe: "trolls", sous_groupe: "geants" },
};

const COULEUR_PAR_LETTRE: Record<Lettre, string> = {
  L: "bg-sky-100 text-sky-700",
  T: "bg-emerald-100 text-emerald-700",
  G: "bg-amber-100 text-amber-700",
};

function lettreDe(a: AffectationJour | undefined): Lettre | null {
  if (!a) return null;
  if (a.groupe === "lutins") return "L";
  return a.sous_groupe === "geants" ? "G" : "T";
}

function formatJourCourt(dateISO: string) {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function RepartitionPage() {
  const profile = useProfile();
  const supabase = createClient();
  const editable = profile.role === "directeur";
  const { periodes, zone, loading: loadingVacances } = useVacances();

  const [animateurs, setAnimateurs] = useState<Animateur[]>([]);
  const [affectations, setAffectations] = useState<AffectationJour[]>([]);
  const [profilesEquipe, setProfilesEquipe] = useState<Profile[]>([]);
  const [effectifs, setEffectifs] = useState<EffectifJour[]>([]);
  const [effectifsSousGroupe, setEffectifsSousGroupe] = useState<EffectifSousGroupe[]>([]);
  const [directionRoster, setDirectionRoster] = useState<DirectionRoster[]>([]);
  const [periodeIndex, setPeriodeIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    supabase
      .from("animateurs")
      .select("*")
      .eq("statut", "actif")
      .order("nom")
      .then(({ data }) => {
        if (data) setAnimateurs(data as Animateur[]);
      });
    supabase
      .from("profiles")
      .select("*")
      .in("role", ["directeur", "coordinateur"])
      .then(({ data }) => {
        if (data) setProfilesEquipe(data as Profile[]);
      });
    supabase
      .from("direction_roster")
      .select("*")
      .then(({ data }) => {
        if (data) setDirectionRoster(data as DirectionRoster[]);
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
  const joursOuvrables = useMemo(
    () => jours.filter((j) => !estWeekend(j)),
    [jours]
  );

  // Bandeau de fond alterné par semaine (bleu/beige) sur la feuille
  // imprimable, comme le document papier — et bordure épaisse au début
  // de chaque nouvelle semaine.
  const BANDE_PAR_SEMAINE = ["bg-sky-50", "bg-amber-50"];
  const semaineIndexParJour = useMemo(() => {
    const map = new Map<string, number>();
    semainesDe(joursOuvrables).forEach((semaine, i) => {
      for (const j of semaine) map.set(j, i);
    });
    return map;
  }, [joursOuvrables]);
  const premierJourDeSemaine = useMemo(
    () => new Set(semainesDe(joursOuvrables).map((s) => s[0])),
    [joursOuvrables]
  );

  async function loadAffectations(debut: string, fin: string) {
    setLoading(true);
    const [{ data: aj }, { data: ej }, { data: esg }] = await Promise.all([
      supabase.from("affectations_jour").select("*").gte("date", debut).lte("date", fin),
      supabase.from("effectifs_jour").select("*").gte("date", debut).lte("date", fin),
      supabase.from("effectifs_sous_groupe").select("*").gte("date", debut).lte("date", fin),
    ]);
    setAffectations((aj as AffectationJour[]) ?? []);
    setEffectifs((ej as EffectifJour[]) ?? []);
    setEffectifsSousGroupe((esg as EffectifSousGroupe[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (periode) loadAffectations(periode.debut, periode.fin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode]);

  const parCle = useMemo(() => {
    const map = new Map<string, AffectationJour>();
    for (const a of affectations) map.set(`${a.date}|${a.animateur_id}`, a);
    return map;
  }, [affectations]);

  function focusCellule(animateurId: string, date: string) {
    inputRefs.current[`${animateurId}|${date}`]?.focus();
  }

  async function assigner(animateurId: string, date: string, lettre: string) {
    const config = lettre ? CONFIG_PAR_LETTRE[lettre as Lettre] : null;
    const precedente = affectations.find(
      (a) => a.animateur_id === animateurId && a.date === date
    );

    setErreur(null);
    setAffectations((prev) => {
      const sansCelle = prev.filter(
        (a) => !(a.animateur_id === animateurId && a.date === date)
      );
      if (!config) return sansCelle;
      return [
        ...sansCelle,
        {
          id: `optimistic-${animateurId}-${date}`,
          date,
          animateur_id: animateurId,
          groupe: config.groupe,
          sous_groupe: config.sous_groupe,
          created_by: profile.id,
          created_at: new Date().toISOString(),
        },
      ];
    });

    function annulerOptimiste() {
      setAffectations((prev) => {
        const sansCelle = prev.filter(
          (a) => !(a.animateur_id === animateurId && a.date === date)
        );
        return precedente ? [...sansCelle, precedente] : sansCelle;
      });
    }

    if (!config) {
      const { error } = await supabase
        .from("affectations_jour")
        .delete()
        .eq("date", date)
        .eq("animateur_id", animateurId);
      if (error) {
        annulerOptimiste();
        setErreur(error.message);
      }
      return;
    }

    const { error } = await supabase
      .from("affectations_jour")
      .upsert(
        {
          date,
          animateur_id: animateurId,
          groupe: config.groupe,
          sous_groupe: config.sous_groupe,
          created_by: profile.id,
        },
        { onConflict: "date,animateur_id" }
      );

    if (error) {
      annulerOptimiste();
      setErreur(error.message);
      return;
    }

    const indexCourant = joursOuvrables.indexOf(date);
    const prochain = joursOuvrables[indexCourant + 1];
    if (prochain) focusCellule(animateurId, prochain);
  }

  function handleChange(
    animateurId: string,
    date: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const lettre = e.target.value.trim().toUpperCase().slice(-1);
    if (lettre && !CONFIG_PAR_LETTRE[lettre as Lettre]) return; // caractère invalide ignoré
    assigner(animateurId, date, lettre);
  }

  // Présent = affecté à un groupe ce jour-là, point (page Répartition).
  function presentCeJour(animateurId: string, date: string): boolean {
    return parCle.has(`${date}|${animateurId}`);
  }

  // Groupe(s) (lettre) dans lesquels cet animateur a été affecté au moins
  // une fois pendant la période — pour le classer en section sur la
  // feuille de présence imprimable (il peut apparaître dans plusieurs
  // sections s'il a changé de groupe).
  function lettresDeLaPeriode(animateurId: string): Lettre[] {
    const set = new Set<Lettre>();
    for (const j of joursOuvrables) {
      const l = lettreDe(parCle.get(`${j}|${animateurId}`));
      if (l) set.add(l);
    }
    return [...set];
  }

  function effectifDe(groupe: Groupe, date: string) {
    return effectifs.find((e) => e.groupe === groupe && e.date === date)?.effectif ?? null;
  }

  function effectifSousGroupeDe(sousGroupe: "trolls" | "geants", date: string) {
    return (
      effectifsSousGroupe.find((e) => e.sous_groupe === sousGroupe && e.date === date)
        ?.effectif ?? null
    );
  }

  async function majEffectifSousGroupe(
    sousGroupe: "trolls" | "geants",
    date: string,
    valeur: number
  ) {
    setEffectifsSousGroupe((prev) => [
      ...prev.filter((e) => !(e.sous_groupe === sousGroupe && e.date === date)),
      {
        id: `optimistic-${sousGroupe}-${date}`,
        date,
        sous_groupe: sousGroupe,
        effectif: valeur,
        created_by: profile.id,
        created_at: new Date().toISOString(),
      },
    ]);
    const { error } = await supabase
      .from("effectifs_sous_groupe")
      .upsert(
        { date, sous_groupe: sousGroupe, effectif: valeur, created_by: profile.id },
        { onConflict: "date,sous_groupe" }
      );
    if (error) setErreur(error.message);
  }

  function sectionDe(profileId: string): SectionDirection | null {
    return directionRoster.find((d) => d.profile_id === profileId)?.section ?? null;
  }

  async function majSection(profileId: string, section: SectionDirection | "") {
    setDirectionRoster((prev) => [
      ...prev.filter((d) => d.profile_id !== profileId),
      {
        id: `optimistic-${profileId}`,
        profile_id: profileId,
        section: section || null,
        created_by: profile.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
    const { error } = await supabase
      .from("direction_roster")
      .upsert(
        { profile_id: profileId, section: section || null, created_by: profile.id },
        { onConflict: "profile_id" }
      );
    if (error) setErreur(error.message);
  }

  function bandeSemaine(date: string) {
    const i = semaineIndexParJour.get(date) ?? 0;
    return BANDE_PAR_SEMAINE[i % BANDE_PAR_SEMAINE.length];
  }

  function bordureSemaine(date: string, premiereColonne: boolean) {
    return !premiereColonne && premierJourDeSemaine.has(date) ? "border-l-4 border-l-amber-700" : "";
  }

  const animateursParProfileId = useMemo(() => {
    const map = new Map<string, Animateur>();
    for (const a of animateurs) if (a.profile_id) map.set(a.profile_id, a);
    return map;
  }, [animateurs]);

  const idsDirection = new Set(
    profilesEquipe
      .map((p) => animateursParProfileId.get(p.id)?.id)
      .filter((id): id is string => !!id)
  );

  const rosterParLettre: Record<Lettre, Animateur[]> = { L: [], T: [], G: [] };
  for (const a of animateurs) {
    if (idsDirection.has(a.id)) continue;
    for (const l of lettresDeLaPeriode(a.id)) rosterParLettre[l].push(a);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Répartition</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {editable
            ? "Tape L (Lutins), T (Trolls) ou G (Géants) dans chaque case — la saisie avance automatiquement au jour suivant. Trolls et Géants restent gérés comme un seul groupe partout ailleurs (Planning, Effectifs, Goûters...), cette distinction est propre à cette page."
            : "Consulte la répartition des animateurs par groupe."}
        </p>
      </div>

      {loadingVacances || periodeIndex === null ? (
        <p className="text-sm text-zinc-400">Chargement du calendrier des vacances...</p>
      ) : periodes.length === 0 ? (
        <p className="text-sm text-zinc-400">
          Aucune période de vacances à venir trouvée (zone {zone}).
        </p>
      ) : (
        <>
          {erreur && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {erreur}
            </p>
          )}

          <div className="no-print flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                Période de vacances · Zone {zone}
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
            <div className="flex gap-3 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-sky-100" /> L = Lutins
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-emerald-100" /> T = Trolls
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-amber-100" /> G = Géants
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-zinc-200" /> Week-end (fermé)
              </span>
            </div>
            {editable && (
              <button
                onClick={() => window.print()}
                className="ml-auto rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Imprimer la feuille de présence
              </button>
            )}
          </div>

          {animateurs.length === 0 ? (
            <p className="no-print text-sm text-zinc-400">
              Aucun animateur actif. Ajoute-en depuis la page Animateurs.
            </p>
          ) : loading ? (
            <p className="no-print text-sm text-zinc-400">Chargement...</p>
          ) : (
            <div className="no-print overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
              <table className="text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="sticky left-0 z-10 bg-zinc-50 px-4 py-3 font-medium">
                      Animateur
                    </th>
                    {jours.map((j) => (
                      <th
                        key={j}
                        className={`px-2 py-3 text-center font-medium capitalize ${
                          estWeekend(j) ? "bg-zinc-100 text-zinc-400" : ""
                        }`}
                      >
                        {formatJourCourt(j)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {animateurs.map((a) => (
                    <tr key={a.id} className="border-b border-zinc-100 last:border-0">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-2 font-medium text-zinc-900">
                        {a.prenom} {a.nom}
                      </td>
                      {jours.map((j) => {
                        if (estWeekend(j)) {
                          return (
                            <td key={j} className="bg-zinc-100 px-2 py-2 text-center" />
                          );
                        }
                        const lettre = lettreDe(parCle.get(`${j}|${a.id}`));
                        return (
                          <td key={j} className="px-2 py-2 text-center">
                            {editable ? (
                              <input
                                ref={(el) => {
                                  inputRefs.current[`${a.id}|${j}`] = el;
                                }}
                                value={lettre ?? ""}
                                onChange={(e) => handleChange(a.id, j, e)}
                                onFocus={(e) => e.target.select()}
                                maxLength={1}
                                className={`h-8 w-8 rounded-md border border-zinc-300 text-center text-sm font-semibold uppercase focus:border-zinc-500 focus:outline-none ${
                                  lettre ? COULEUR_PAR_LETTRE[lettre] : ""
                                }`}
                              />
                            ) : (
                              <span
                                className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold ${
                                  lettre ? COULEUR_PAR_LETTRE[lettre] : "text-zinc-300"
                                }`}
                              >
                                {lettre ?? "—"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {editable && profilesEquipe.length > 0 && (
            <div className="no-print rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Équipe administrative — section sur la feuille imprimable
              </p>
              <div className="flex flex-col gap-2">
                {profilesEquipe.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="w-48 shrink-0 truncate text-sm text-zinc-700">
                      {p.full_name}{" "}
                      <span className="text-xs text-zinc-400">
                        ({p.role === "directeur" ? "directeur" : "coordinateur"})
                      </span>
                    </span>
                    {p.role === "directeur" ? (
                      <span className="text-xs text-zinc-400">
                        Toujours en tête, hors section
                      </span>
                    ) : (
                      <select
                        value={sectionDe(p.id) ?? ""}
                        onChange={(e) =>
                          majSection(p.id, e.target.value as SectionDirection | "")
                        }
                        className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
                      >
                        <option value="">Aucune section</option>
                        <option value="lutins">{GROUPE_LABELS.lutins}</option>
                        <option value="trolls">Trolls</option>
                        <option value="geants">Géants</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {editable && (
            <div className="no-print overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
              <p className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Effectifs enfants Trolls / Géants (feuille imprimable — l&apos;effectif
                Lutins se saisit sur Plannings)
              </p>
              {(["trolls", "geants"] as const).map((sg) => (
                <table key={sg} className="text-left text-sm">
                  <tbody>
                    <tr className="border-b border-zinc-100 last:border-0">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-2 font-medium text-zinc-900">
                        {sg === "trolls" ? "Trolls" : "Géants"}
                      </td>
                      {joursOuvrables.map((j) => (
                        <td key={j} className="px-2 py-2 text-center">
                          <input
                            type="number"
                            min={0}
                            defaultValue={effectifSousGroupeDe(sg, j) ?? ""}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (!Number.isNaN(v)) majEffectifSousGroupe(sg, j, v);
                            }}
                            className="w-14 rounded-md border border-zinc-300 px-1 py-1 text-center text-xs"
                          />
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              ))}
            </div>
          )}

          {/* Feuille de présence imprimable : toutes les semaines de la
              période côte à côte, sections Direction / Lutins / Trolls /
              Géants, effectifs enfants et total, comme le document papier.
              Présent = affecté à un groupe ce jour-là, rien d'autre à
              saisir. */}
          <div className="print-portrait hidden print:block">
            <p className="text-center text-lg font-bold uppercase">
              {periode?.description}
            </p>
            <table className="mt-4 w-full border-collapse text-left text-[10px]">
              <thead>
                <tr>
                  <th className="border border-black px-1 py-1 font-semibold">Nom</th>
                  <th className="border border-black px-1 py-1 font-semibold">Prénom</th>
                  {joursOuvrables.map((j) => (
                    <th
                      key={j}
                      className={`border border-black px-1 py-1 text-center font-semibold capitalize ${bandeSemaine(j)} ${bordureSemaine(j, false)}`}
                    >
                      {formatJourCourt(j)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profilesEquipe.some((p) => p.role === "directeur") && (
                  <tr>
                    <td
                      colSpan={2 + joursOuvrables.length}
                      className="border border-black bg-zinc-300 px-1 py-1 font-bold"
                    >
                      Direction
                    </td>
                  </tr>
                )}
                {profilesEquipe
                  .filter((p) => p.role === "directeur")
                  .map((p) => {
                    const a = animateursParProfileId.get(p.id);
                    if (!a) return null;
                    const couleur = "bg-orange-200";
                    return (
                      <tr key={p.id}>
                        <td className={`border border-black px-1 py-1 font-semibold uppercase ${couleur}`}>
                          {a.nom}
                        </td>
                        <td className={`border border-black px-1 py-1 ${couleur}`}>{a.prenom}</td>
                        {joursOuvrables.map((j) => {
                          const present = presentCeJour(a.id, j) === true;
                          return (
                            <td
                              key={j}
                              className={`border border-black px-1 py-1 text-center ${
                                present ? couleur : bandeSemaine(j)
                              } ${bordureSemaine(j, false)}`}
                            >
                              {present ? "X" : ""}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                {(["L", "T", "G"] as Lettre[]).map((lettre) => {
                  const sectionCorrespondante: SectionDirection =
                    lettre === "L" ? "lutins" : lettre === "T" ? "trolls" : "geants";
                  const coordinateurs = profilesEquipe.filter(
                    (p) => p.role === "coordinateur" && sectionDe(p.id) === sectionCorrespondante
                  );
                  const liste = rosterParLettre[lettre];
                  if (liste.length === 0 && coordinateurs.length === 0) return null;
                  return (
                    <>
                      <tr key={`titre-${lettre}`}>
                        <td
                          colSpan={2 + joursOuvrables.length}
                          className="border border-black bg-zinc-300 px-1 py-1 font-bold"
                        >
                          {lettre === "L"
                            ? GROUPE_LABELS.lutins
                            : lettre === "T"
                              ? "Trolls"
                              : "Géants"}
                        </td>
                      </tr>
                      {coordinateurs.map((p) => {
                        const a = animateursParProfileId.get(p.id);
                        if (!a) return null;
                        const couleur = "bg-yellow-200";
                        return (
                          <tr key={`coord-${p.id}`}>
                            <td className={`border border-black px-1 py-1 font-semibold uppercase ${couleur}`}>
                              {a.nom}
                            </td>
                            <td className={`border border-black px-1 py-1 ${couleur}`}>{a.prenom}</td>
                            {joursOuvrables.map((j) => {
                              const present = presentCeJour(a.id, j) === true;
                              return (
                                <td
                                  key={j}
                                  className={`border border-black px-1 py-1 text-center ${
                                    present ? couleur : bandeSemaine(j)
                                  } ${bordureSemaine(j, false)}`}
                                >
                                  {present ? "X" : ""}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      {liste.map((a) => {
                        const couleur = !a.est_stagiaire ? "bg-yellow-200" : "";
                        return (
                          <tr key={`${lettre}-${a.id}`}>
                            <td className={`border border-black px-1 py-1 font-semibold uppercase ${couleur}`}>
                              {a.nom}
                            </td>
                            <td className={`border border-black px-1 py-1 ${couleur}`}>{a.prenom}</td>
                            {joursOuvrables.map((j) => {
                              const present =
                                lettreDe(parCle.get(`${j}|${a.id}`)) === lettre &&
                                presentCeJour(a.id, j) === true;
                              return (
                                <td
                                  key={j}
                                  className={`border border-black px-1 py-1 text-center ${
                                    present ? couleur || bandeSemaine(j) : bandeSemaine(j)
                                  } ${bordureSemaine(j, false)}`}
                                >
                                  {present ? "X" : ""}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      <tr key={`effectif-${lettre}`}>
                        <td
                          colSpan={2}
                          className="border border-black bg-teal-100 px-1 py-1 font-semibold"
                        >
                          Effectifs enfants
                        </td>
                        {joursOuvrables.map((j) => (
                          <td
                            key={j}
                            className={`border border-black bg-teal-100 px-1 py-1 text-center font-semibold ${bordureSemaine(j, false)}`}
                          >
                            {(lettre === "L"
                              ? effectifDe("lutins", j)
                              : effectifSousGroupeDe(lettre === "T" ? "trolls" : "geants", j)) ?? ""}
                          </td>
                        ))}
                      </tr>
                    </>
                  );
                })}

                <tr>
                  <td
                    colSpan={2}
                    className="border border-black bg-sky-200 px-1 py-1 font-bold uppercase"
                  >
                    Total enfants
                  </td>
                  {joursOuvrables.map((j) => {
                    const total =
                      (effectifDe("lutins", j) ?? 0) +
                      (effectifSousGroupeDe("trolls", j) ?? 0) +
                      (effectifSousGroupeDe("geants", j) ?? 0);
                    return (
                      <td
                        key={j}
                        className="border border-black bg-sky-200 px-1 py-1 text-center font-bold"
                      >
                        {total || ""}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
