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
  type RoleAffiche,
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
      .from("direction_roster")
      .select("*")
      .then(({ data }) => {
        // Normalise "sections" au cas où la migration_024 (section unique
        // -> tableau sections) n'a pas encore tourné côté base : évite un
        // plantage de toute la page si le champ manque ou vaut encore null.
        if (data)
          setDirectionRoster(
            (data as (DirectionRoster & { section?: string | null })[]).map((d) => ({
              ...d,
              sections: Array.isArray(d.sections) ? d.sections : d.section ? [d.section as SectionDirection] : [],
            }))
          );
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

  // Effectif Lutins : modifiable uniquement ici (verrouillé en lecture
  // seule sur Plannings) pour éviter d'avoir deux endroits où le saisir.
  async function majEffectifLutins(date: string, valeur: number) {
    setEffectifs((prev) => [
      ...prev.filter((e) => !(e.groupe === "lutins" && e.date === date)),
      {
        id: `optimistic-lutins-${date}`,
        date,
        groupe: "lutins",
        effectif: valeur,
        created_by: profile.id,
        created_at: new Date().toISOString(),
      },
    ]);
    const { error } = await supabase
      .from("effectifs_jour")
      .upsert(
        { date, groupe: "lutins", effectif: valeur, created_by: profile.id },
        { onConflict: "date,groupe" }
      );
    if (error) setErreur(error.message);
  }

  function rosterDe(animateurId: string) {
    return directionRoster.find((d) => d.animateur_id === animateurId);
  }

  // Ajoute/retire une fiche animateur de l'équipe administrative affichée
  // (Directeur/Coordinateur) — indépendant d'un compte utilisateur, on
  // peut donc y mettre quelqu'un qui n'a pas créé de compte.
  async function majRoleAffiche(animateurId: string, role: RoleAffiche | "") {
    setErreur(null);
    if (!role) {
      setDirectionRoster((prev) => prev.filter((d) => d.animateur_id !== animateurId));
      const { error } = await supabase
        .from("direction_roster")
        .delete()
        .eq("animateur_id", animateurId);
      if (error) setErreur(error.message);
      return;
    }
    const sections = role === "coordinateur" ? (rosterDe(animateurId)?.sections ?? []) : [];
    setDirectionRoster((prev) => [
      ...prev.filter((d) => d.animateur_id !== animateurId),
      {
        id: `optimistic-${animateurId}`,
        animateur_id: animateurId,
        role_affiche: role,
        sections,
        created_by: profile.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
    const { error } = await supabase
      .from("direction_roster")
      .upsert(
        { animateur_id: animateurId, role_affiche: role, sections, created_by: profile.id },
        { onConflict: "animateur_id" }
      );
    if (error) setErreur(error.message);
  }

  // Un coordinateur peut gérer plusieurs groupes à la fois — coche/décoche
  // une section dans la liste sans toucher aux autres.
  async function toggleSectionRoster(
    animateurId: string,
    section: SectionDirection,
    coche: boolean
  ) {
    setErreur(null);
    const actuelles = rosterDe(animateurId)?.sections ?? [];
    const sections = coche
      ? [...actuelles, section]
      : actuelles.filter((s) => s !== section);
    setDirectionRoster((prev) =>
      prev.map((d) => (d.animateur_id === animateurId ? { ...d, sections } : d))
    );
    const { error } = await supabase
      .from("direction_roster")
      .update({ sections })
      .eq("animateur_id", animateurId);
    if (error) setErreur(error.message);
  }

  function bandeSemaine(date: string) {
    const i = semaineIndexParJour.get(date) ?? 0;
    return BANDE_PAR_SEMAINE[i % BANDE_PAR_SEMAINE.length];
  }

  function bordureSemaine(date: string, premiereColonne: boolean) {
    return !premiereColonne && premierJourDeSemaine.has(date) ? "border-l-4 border-l-amber-700" : "";
  }

  // Même traitement (ligne épaisse ambre) que la bordure entre semaines,
  // mais horizontale : sépare les sections Direction / Lutins / Trolls /
  // Géants sur la feuille imprimable.
  function bordureSection(active: boolean) {
    return active ? "border-t-4 border-t-amber-700" : "";
  }

  const animateurParId = useMemo(() => {
    const map = new Map<string, Animateur>();
    for (const a of animateurs) map.set(a.id, a);
    return map;
  }, [animateurs]);

  const idsDirection = new Set(directionRoster.map((d) => d.animateur_id));

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

          {editable && animateurs.length > 0 && (
            <div className="no-print rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Équipe administrative (feuille imprimable) — indépendant d&apos;un
                compte utilisateur, pas besoin que la personne se soit inscrite
              </p>
              <div className="flex flex-col gap-2">
                {animateurs.map((a) => {
                  const entry = rosterDe(a.id);
                  return (
                    <div key={a.id} className="flex items-center gap-2">
                      <span className="w-48 shrink-0 truncate text-sm text-zinc-700">
                        {a.prenom} {a.nom}
                      </span>
                      <select
                        value={entry?.role_affiche ?? ""}
                        onChange={(e) =>
                          majRoleAffiche(a.id, e.target.value as RoleAffiche | "")
                        }
                        className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
                      >
                        <option value="">Animateur (aucun rôle)</option>
                        <option value="directeur">Directeur</option>
                        <option value="coordinateur">Coordinateur</option>
                      </select>
                      {entry?.role_affiche === "coordinateur" && (
                        <div className="flex items-center gap-3">
                          {(
                            [
                              ["lutins", GROUPE_LABELS.lutins],
                              ["trolls", "Trolls"],
                              ["geants", "Géants"],
                            ] as [SectionDirection, string][]
                          ).map(([section, label]) => (
                            <label
                              key={section}
                              className="flex items-center gap-1 text-sm text-zinc-700"
                            >
                              <input
                                type="checkbox"
                                checked={entry.sections.includes(section)}
                                onChange={(e) =>
                                  toggleSectionRoster(a.id, section, e.target.checked)
                                }
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {editable && (
            <div className="no-print overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
              <p className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Effectifs enfants (feuille imprimable) — Lutins modifiable
                uniquement ici (verrouillé sur Plannings) ; l&apos;effectif Trolls
                global pour le calcul d&apos;encadrement continue de se saisir sur
                Plannings
              </p>
              <table className="text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="sticky left-0 z-10 bg-zinc-50 px-4 py-3 font-medium">
                      Groupe
                    </th>
                    {joursOuvrables.map((j) => (
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
                  <tr className="border-b border-zinc-100 last:border-0">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-2 font-medium text-zinc-900">
                      {GROUPE_LABELS.lutins}
                    </td>
                    {joursOuvrables.map((j) => {
                      if (estWeekend(j)) {
                        return <td key={j} className="bg-zinc-100 px-2 py-2 text-center" />;
                      }
                      return (
                        <td key={j} className="px-2 py-2 text-center">
                          <input
                            type="number"
                            min={0}
                            defaultValue={effectifDe("lutins", j) ?? ""}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (!Number.isNaN(v)) majEffectifLutins(j, v);
                            }}
                            className="w-14 rounded-md border border-zinc-300 px-1 py-1 text-center text-xs"
                          />
                        </td>
                      );
                    })}
                  </tr>
                  {(["trolls", "geants"] as const).map((sg) => (
                    <tr key={sg} className="border-b border-zinc-100 last:border-0">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-2 font-medium text-zinc-900">
                        {sg === "trolls" ? "Trolls" : "Géants"}
                      </td>
                      {joursOuvrables.map((j) => {
                        if (estWeekend(j)) {
                          return <td key={j} className="bg-zinc-100 px-2 py-2 text-center" />;
                        }
                        return (
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
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
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
                  <th className="border border-black px-1 py-1 font-semibold">Rôle</th>
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
                {directionRoster.some((d) => d.role_affiche === "directeur") && (
                  <tr>
                    <td
                      colSpan={3 + joursOuvrables.length}
                      className="border border-black bg-zinc-300 px-1 py-1 font-bold"
                    >
                      Direction
                    </td>
                  </tr>
                )}
                {directionRoster
                  .filter((d) => d.role_affiche === "directeur")
                  .map((d) => {
                    const a = animateurParId.get(d.animateur_id);
                    if (!a) return null;
                    const couleur = "bg-orange-200";
                    return (
                      <tr key={d.id}>
                        <td className={`border border-black px-1 py-1 ${couleur}`}>Directeur</td>
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

                {(() => {
                  // Trait épais ambre entre chaque section (Direction /
                  // Lutins / Trolls / Géants) qui s'affiche réellement,
                  // comme la bordure entre semaines — remplace l'ancienne
                  // ligne de titre pleine largeur.
                  let sectionPrecedenteAffichee = directionRoster.some(
                    (d) => d.role_affiche === "directeur"
                  );
                  return (["L", "T", "G"] as Lettre[]).map((lettre) => {
                    const sectionCorrespondante: SectionDirection =
                      lettre === "L" ? "lutins" : lettre === "T" ? "trolls" : "geants";
                    // Un coordinateur peut gérer plusieurs groupes à la fois :
                    // il apparaît dans chaque section qu'il gère.
                    const coordinateurs = directionRoster.filter(
                      (d) =>
                        d.role_affiche === "coordinateur" &&
                        d.sections.includes(sectionCorrespondante)
                    );
                    const liste = rosterParLettre[lettre];
                    if (liste.length === 0 && coordinateurs.length === 0) return null;
                    const avecBordureHaut = sectionPrecedenteAffichee;
                    sectionPrecedenteAffichee = true;
                    const age =
                      lettre === "L" ? "3-5 ans" : lettre === "T" ? "6-8 ans" : "9-10 ans";
                    const labelGroupe =
                      (lettre === "L"
                        ? GROUPE_LABELS.lutins
                        : lettre === "T"
                          ? "Trolls"
                          : "Géants") + ` (${age})`;
                    // La colonne Rôle est fusionnée (rowSpan) sur tous les
                    // animateurs + la ligne effectifs de la section, pour y
                    // afficher le groupe et la tranche d'âge une seule fois —
                    // comme le document papier. Les coordinateurs gardent
                    // leur propre case "Coordinateur".
                    const lignesAFusionner = liste.length + 1;
                    return (
                      <>
                        {coordinateurs.map((d, idx) => {
                          const a = animateurParId.get(d.animateur_id);
                          if (!a) return null;
                          const couleur = "bg-yellow-200";
                          const bordureHaut =
                            idx === 0 ? bordureSection(avecBordureHaut) : "";
                          return (
                            <tr key={`coord-${d.id}`}>
                              <td className={`border border-black px-1 py-1 ${couleur} ${bordureHaut}`}>
                                Coordinateur
                              </td>
                              <td className={`border border-black px-1 py-1 font-semibold uppercase ${couleur} ${bordureHaut}`}>
                                {a.nom}
                              </td>
                              <td className={`border border-black px-1 py-1 ${couleur} ${bordureHaut}`}>{a.prenom}</td>
                              {joursOuvrables.map((j) => {
                                const present = presentCeJour(a.id, j) === true;
                                return (
                                  <td
                                    key={j}
                                    className={`border border-black px-1 py-1 text-center ${
                                      present ? couleur : bandeSemaine(j)
                                    } ${bordureSemaine(j, false)} ${bordureHaut}`}
                                  >
                                    {present ? "X" : ""}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                        {liste.map((a, idx) => {
                          const couleur = !a.est_stagiaire ? "bg-yellow-200" : "";
                          const bordureHaut =
                            idx === 0 && coordinateurs.length === 0
                              ? bordureSection(avecBordureHaut)
                              : "";
                          return (
                            <tr key={`${lettre}-${a.id}`}>
                              {idx === 0 && (
                                <td
                                  rowSpan={lignesAFusionner}
                                  className={`border border-black bg-zinc-100 px-1 py-1 text-center font-semibold ${bordureHaut}`}
                                >
                                  {labelGroupe}
                                </td>
                              )}
                              <td className={`border border-black px-1 py-1 font-semibold uppercase ${couleur} ${bordureHaut}`}>
                                {a.nom}
                              </td>
                              <td className={`border border-black px-1 py-1 ${couleur} ${bordureHaut}`}>{a.prenom}</td>
                              {joursOuvrables.map((j) => {
                                const present =
                                  lettreDe(parCle.get(`${j}|${a.id}`)) === lettre &&
                                  presentCeJour(a.id, j) === true;
                                return (
                                  <td
                                    key={j}
                                    className={`border border-black px-1 py-1 text-center ${
                                      present ? couleur || bandeSemaine(j) : bandeSemaine(j)
                                    } ${bordureSemaine(j, false)} ${bordureHaut}`}
                                  >
                                    {present ? "X" : ""}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                        <tr key={`effectif-${lettre}`}>
                          {liste.length === 0 && (
                            <td
                              rowSpan={lignesAFusionner}
                              className="border border-black bg-zinc-100 px-1 py-1 text-center font-semibold"
                            >
                              {labelGroupe}
                            </td>
                          )}
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
                  });
                })()}

                <tr>
                  <td
                    colSpan={3}
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
