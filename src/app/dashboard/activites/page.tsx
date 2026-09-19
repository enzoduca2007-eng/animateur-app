"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { useVacances } from "@/lib/use-vacances";
import { estWeekend, joursDe, periodeEnCours, semainesDe } from "@/lib/vacances";
import { PeriodesVacances } from "@/components/periodes-vacances";
import { toMinutes } from "@/lib/creneaux";
import {
  GROUPES,
  GROUPE_LABELS,
  MOMENTS_ACTIVITE,
  type AffectationCreneau,
  type AffectationJour,
  type Animateur,
  type Creneau,
  type Groupe,
  type MomentActivite,
  type PlanningActivite,
  type ThemeSemaine,
} from "@/lib/types";

function formatEnTeteJour(dateISO: string) {
  return new Date(`${dateISO}T00:00:00Z`)
    .toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", timeZone: "UTC" })
    .toUpperCase();
}

function formatJourLong(dateISO: string) {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function formatHeure(heure: string) {
  return heure.slice(0, 5);
}

// Le lundi de la semaine contenant cette date (clé utilisée pour le thème
// de la semaine) — même logique que semainesDe() dans lib/vacances.
function lundiDe(dateISO: string) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  const jourSemaine = d.getUTCDay();
  const decalage = jourSemaine === 0 ? 6 : jourSemaine - 1;
  return new Date(d.getTime() - decalage * 86400000).toISOString().slice(0, 10);
}

export default function ActivitesPage() {
  const profile = useProfile();
  const supabase = createClient();
  const { periodes, zone, loading: loadingVacances } = useVacances();

  const monGroupe = profile.role === "coordinateur" ? profile.groupe_coordinateur : null;
  const groupesGeres = useMemo(
    () => (monGroupe ? GROUPES.filter((g) => g === monGroupe) : GROUPES),
    [monGroupe]
  );

  function peutGererGroupe(groupe: Groupe) {
    if (profile.role === "directeur") return true;
    if (profile.role !== "coordinateur") return false;
    return !monGroupe || monGroupe === groupe;
  }

  const [periodeIndex, setPeriodeIndex] = useState<number | null>(null);
  const [semaineIndex, setSemaineIndex] = useState(0);
  const [groupeSelectionne, setGroupeSelectionne] = useState<Groupe>(monGroupe ?? "lutins");
  const [animateurs, setAnimateurs] = useState<Animateur[]>([]);
  const [affectationsJour, setAffectationsJour] = useState<AffectationJour[]>([]);
  const [activites, setActivites] = useState<PlanningActivite[]>([]);
  const [themes, setThemes] = useState<ThemeSemaine[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [modal, setModal] = useState<{
    date: string;
    moment: MomentActivite;
    groupe: Groupe;
    activite: PlanningActivite | null;
  } | null>(null);
  const [modalLibelle, setModalLibelle] = useState("");
  const [modalAnimateurs, setModalAnimateurs] = useState<string[]>([]);
  const [monAnimateur, setMonAnimateur] = useState<Animateur | null>(null);
  const [creneaux, setCreneaux] = useState<Creneau[]>([]);
  const [mesAffectationsCreneau, setMesAffectationsCreneau] = useState<AffectationCreneau[]>([]);

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
    if (loadingVacances || periodes.length === 0 || periodeIndex !== null) return;
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const defaut = periodeEnCours(periodes, aujourdhui);
    const index = periodes.findIndex((p) => p === defaut);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPeriodeIndex(index >= 0 ? index : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingVacances, periodes]);

  const periode = periodeIndex !== null ? periodes[periodeIndex] : null;
  const joursOuvres = useMemo(
    () => (periode ? joursDe(periode).filter((j) => !estWeekend(j)) : []),
    [periode]
  );
  const semaines = useMemo(() => semainesDe(joursOuvres), [joursOuvres]);
  const semaineIndexSafe = Math.min(semaineIndex, Math.max(0, semaines.length - 1));

  // Horaires perso, uniquement utiles pour la vue "un animateur" (page par
  // jour) — pas besoin de charger ça pour le directeur/coordinateur.
  useEffect(() => {
    if (profile.role !== "animateur" || !monAnimateur || !periode) return;
    Promise.all([
      supabase.from("creneaux").select("*"),
      supabase
        .from("affectations_creneau")
        .select("*")
        .eq("animateur_id", monAnimateur.id)
        .gte("date", periode.debut)
        .lte("date", periode.fin),
    ]).then(([{ data: c }, { data: ac }]) => {
      setCreneaux((c as Creneau[]) ?? []);
      setMesAffectationsCreneau((ac as AffectationCreneau[]) ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.role, monAnimateur, periode]);

  async function chargerDonnees() {
    if (!periode) return;
    setLoading(true);
    const [{ data: a }, { data: aj }, { data: pa }, { data: ts }] = await Promise.all([
      supabase.from("animateurs").select("*").eq("statut", "actif").order("nom"),
      supabase
        .from("affectations_jour")
        .select("*")
        .gte("date", periode.debut)
        .lte("date", periode.fin),
      supabase
        .from("planning_activites")
        .select("*")
        .gte("date", periode.debut)
        .lte("date", periode.fin)
        .order("ordre"),
      supabase
        .from("themes_semaine")
        .select("*")
        .gte("semaine_debut", periode.debut)
        .lte("semaine_debut", periode.fin),
    ]);
    setAnimateurs((a as Animateur[]) ?? []);
    setAffectationsJour((aj as AffectationJour[]) ?? []);
    setActivites((pa as PlanningActivite[]) ?? []);
    setThemes((ts as ThemeSemaine[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    chargerDonnees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode]);

  function animateursDuGroupe(groupe: Groupe, date: string) {
    return affectationsJour
      .filter((a) => a.groupe === groupe && a.date === date)
      .map((a) => a.animateur_id);
  }

  function activitesDe(groupe: Groupe, date: string, moment: MomentActivite) {
    return activites
      .filter((a) => a.groupe === groupe && a.date === date && a.moment === moment)
      .sort((a, b) => a.ordre - b.ordre);
  }

  function nomsDe(ids: string[]) {
    return ids
      .map((id) => animateurs.find((a) => a.id === id))
      .filter((a): a is Animateur => !!a)
      .map((a) => a.prenom);
  }

  function groupeDuJour(date: string) {
    return affectationsJour.find((a) => a.animateur_id === monAnimateur?.id && a.date === date)
      ?.groupe;
  }

  function horairesDuJour(date: string) {
    const ids = new Set(
      mesAffectationsCreneau.filter((a) => a.date === date).map((a) => a.creneau_id)
    );
    const assignes = creneaux.filter((c) => ids.has(c.id));
    const arrivees = assignes.filter((c) => c.type === "arrivee");
    const departs = assignes.filter((c) => c.type === "depart");
    if (arrivees.length === 0 && departs.length === 0) return null;
    const debut = arrivees.length
      ? arrivees.reduce((min, c) => (toMinutes(c.heure_debut) < toMinutes(min.heure_debut) ? c : min))
          .heure_debut
      : null;
    const fin = departs.length
      ? departs.reduce((max, c) => (toMinutes(c.heure_debut) > toMinutes(max.heure_debut) ? c : max))
          .heure_debut
      : null;
    return { debut, fin };
  }

  function ouvrirAjout(date: string, moment: MomentActivite, groupe: Groupe) {
    setModal({ date, moment, groupe, activite: null });
    setModalLibelle("");
    setModalAnimateurs([]);
  }

  function ouvrirEdition(activite: PlanningActivite) {
    setModal({
      date: activite.date,
      moment: activite.moment,
      groupe: activite.groupe,
      activite,
    });
    setModalLibelle(activite.libelle);
    setModalAnimateurs(activite.animateur_ids);
  }

  async function enregistrerActivite() {
    if (!modal || !modalLibelle.trim()) return;
    setErreur(null);
    if (modal.activite) {
      const { error } = await supabase
        .from("planning_activites")
        .update({ libelle: modalLibelle.trim(), animateur_ids: modalAnimateurs })
        .eq("id", modal.activite.id);
      if (error) {
        setErreur(error.message);
        return;
      }
    } else {
      const ordre = activitesDe(modal.groupe, modal.date, modal.moment).length;
      const { error } = await supabase.from("planning_activites").insert({
        date: modal.date,
        groupe: modal.groupe,
        moment: modal.moment,
        ordre,
        libelle: modalLibelle.trim(),
        animateur_ids: modalAnimateurs,
        created_by: profile.id,
      });
      if (error) {
        setErreur(error.message);
        return;
      }
    }
    setModal(null);
    chargerDonnees();
  }

  async function supprimerActivite(id: string) {
    if (!confirm("Supprimer cette activité ?")) return;
    await supabase.from("planning_activites").delete().eq("id", id);
    chargerDonnees();
  }

  function themeDe(groupe: Groupe, semaineDebut: string) {
    return themes.find((t) => t.groupe === groupe && t.semaine_debut === semaineDebut)?.theme ?? "";
  }

  async function majTheme(groupe: Groupe, semaineDebut: string, valeur: string) {
    setThemes((prev) => {
      const sans = prev.filter((t) => !(t.groupe === groupe && t.semaine_debut === semaineDebut));
      return [
        ...sans,
        {
          id: `optimistic-${groupe}-${semaineDebut}`,
          groupe,
          semaine_debut: semaineDebut,
          theme: valeur,
          created_by: profile.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
    });
    const { error } = await supabase
      .from("themes_semaine")
      .upsert(
        { groupe, semaine_debut: semaineDebut, theme: valeur || null, created_by: profile.id },
        { onConflict: "groupe,semaine_debut" }
      );
    if (error) setErreur(error.message);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print">
        <h1 className="text-2xl font-semibold text-zinc-900">Planning d&apos;activités</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Programme les activités de chaque demi-journée et assigne les
          animateurs qui les encadrent.
        </p>
      </div>

      <div className="no-print">
        <PeriodesVacances periodes={periodes} zone={zone} loading={loadingVacances} />
      </div>

      {erreur && (
        <p className="no-print rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {erreur}
        </p>
      )}

      {loadingVacances || periodeIndex === null ? (
        <p className="text-sm text-zinc-400">Chargement...</p>
      ) : periodes.length === 0 ? (
        <p className="text-sm text-zinc-400">Aucune période de vacances trouvée.</p>
      ) : profile.role === "animateur" ? (
        <div className="flex flex-col gap-4">
          {!monAnimateur ? (
            <p className="text-sm text-amber-700">
              Ton compte n&apos;est pas encore relié à une fiche animateur.
            </p>
          ) : joursOuvres.every((j) => !groupeDuJour(j)) ? (
            <p className="text-sm text-zinc-400">
              Aucune affectation trouvée sur cette période.
            </p>
          ) : (
            joursOuvres
              .filter((j) => groupeDuJour(j))
              .map((j) => {
                const groupe = groupeDuJour(j)!;
                const horaires = horairesDuJour(j);
                return (
                  <div
                    key={j}
                    className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-lg font-bold capitalize text-zinc-900">
                        {formatJourLong(j)}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                          {GROUPE_LABELS[groupe]}
                        </span>
                        {horaires && (horaires.debut || horaires.fin) && (
                          <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-bold text-white">
                            {horaires.debut ? formatHeure(horaires.debut) : "?"} →{" "}
                            {horaires.fin ? formatHeure(horaires.fin) : "?"}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {MOMENTS_ACTIVITE.map((m) => {
                        const mesActivites = activitesDe(groupe, j, m.cle);
                        return (
                          <div key={m.cle}>
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                              {m.label}
                            </p>
                            {mesActivites.length === 0 ? (
                              <p className="mt-1 text-xs text-zinc-300">—</p>
                            ) : (
                              <ul className="mt-1 flex flex-col gap-1.5">
                                {mesActivites.map((act) => {
                                  const cAssigne = act.animateur_ids.includes(monAnimateur.id);
                                  return (
                                    <li
                                      key={act.id}
                                      className={`rounded px-1.5 py-1 text-sm ${
                                        cAssigne
                                          ? "bg-emerald-100 font-medium text-emerald-800"
                                          : "text-zinc-500"
                                      }`}
                                    >
                                      {act.libelle}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      ) : (
        <>
          <div className="no-print flex flex-wrap items-end gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                Période
              </p>
              <select
                value={periodeIndex}
                onChange={(e) => {
                  setPeriodeIndex(Number(e.target.value));
                  setSemaineIndex(0);
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
            {semaines.length > 0 && (
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
                      Semaine {i + 1} ({formatEnTeteJour(s[0])})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {groupesGeres.length > 1 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Groupe
                </p>
                <select
                  value={groupeSelectionne}
                  onChange={(e) => setGroupeSelectionne(e.target.value as Groupe)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                >
                  {groupesGeres.map((g) => (
                    <option key={g} value={g}>
                      {GROUPE_LABELS[g]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={() => window.print()}
              className="ml-auto rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Imprimer
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-zinc-400">Chargement...</p>
          ) : (
            <div className="flex flex-col gap-6 print:gap-0">
              {groupesGeres.map((groupe) =>
                semaines.map((semaineJours, semaineIdx) => {
                  const semaineDebut = lundiDe(semaineJours[0]);
                  const affichee =
                    semaineIdx === semaineIndexSafe && groupe === groupeSelectionne;
                  return (
                    <div
                      key={`${groupe}-${semaineJours[0]}`}
                      className={`print-page ${affichee ? "" : "hidden"}`}
                    >
                      <div className="relative rounded-t-xl border border-b-0 border-zinc-300 bg-zinc-100 px-4 py-3 print:rounded-none print:border-black">
                        <p className="text-center text-sm font-bold uppercase tracking-wide text-zinc-700 print:text-base">
                          {GROUPE_LABELS[groupe]} · Semaine {semaineIdx + 1}
                        </p>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-zinc-400 bg-white print:border-black">
                            <textarea
                              value={themeDe(groupe, semaineDebut)}
                              readOnly={!peutGererGroupe(groupe)}
                              onChange={(e) => majTheme(groupe, semaineDebut, e.target.value)}
                              placeholder={peutGererGroupe(groupe) ? "Thème" : ""}
                              className="h-[52px] w-[52px] resize-none border-0 bg-transparent text-center text-[9px] font-medium leading-tight text-zinc-700 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-b-xl border border-zinc-300 bg-white shadow-sm print:overflow-visible print:rounded-none print:border-black print:shadow-none">
                        <table className="w-full table-fixed border-collapse text-left text-sm print:text-xs">
                          <thead>
                            <tr>
                              <th className="w-10 border border-zinc-300 bg-zinc-50 px-1 py-2 print:border-black" />
                              {semaineJours.map((j) => (
                                <th
                                  key={j}
                                  className="border border-zinc-300 bg-zinc-50 px-2 py-2 text-center font-bold print:border-black"
                                >
                                  {formatEnTeteJour(j)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {MOMENTS_ACTIVITE.map((m) => (
                              <tr key={m.cle}>
                                {m.cle === "temps_calme" ? (
                                  <td className="border border-zinc-300 bg-zinc-50 px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500 print:border-black">
                                    Temps
                                    <br />
                                    calme
                                  </td>
                                ) : (
                                  <td
                                    className="border border-zinc-300 bg-zinc-50 px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500 print:border-black"
                                    style={{ writingMode: "vertical-rl" }}
                                  >
                                    <span className="inline-block rotate-180">{m.label}</span>
                                  </td>
                                )}
                                {semaineJours.map((j) => (
                                  <td
                                    key={j}
                                    className="align-top border border-zinc-300 p-2 text-xs print:border-black"
                                  >
                                    <ul className="flex flex-col gap-1.5">
                                      {activitesDe(groupe, j, m.cle).map((act) => {
                                        const cAssigne =
                                          !!monAnimateur && act.animateur_ids.includes(monAnimateur.id);
                                        return (
                                        <li
                                          key={act.id}
                                          className={`group rounded px-1 -mx-1 ${
                                            cAssigne ? "bg-emerald-200 print:bg-emerald-200" : ""
                                          }`}
                                        >
                                          <div className="flex items-start justify-between gap-1">
                                            <span>– {act.libelle}</span>
                                            {peutGererGroupe(groupe) && (
                                              <span className="no-print hidden shrink-0 gap-1 group-hover:flex">
                                                <button
                                                  onClick={() => ouvrirEdition(act)}
                                                  className="text-zinc-400 hover:text-zinc-700"
                                                  title="Modifier"
                                                >
                                                  ✎
                                                </button>
                                                <button
                                                  onClick={() => supprimerActivite(act.id)}
                                                  className="text-red-400 hover:text-red-600"
                                                  title="Supprimer"
                                                >
                                                  ✕
                                                </button>
                                              </span>
                                            )}
                                          </div>
                                          {act.animateur_ids.length > 0 && (
                                            <p className="pl-3 text-xs font-semibold text-emerald-700">
                                              → {nomsDe(act.animateur_ids).join(", ")}
                                            </p>
                                          )}
                                        </li>
                                        );
                                      })}
                                    </ul>
                                    {peutGererGroupe(groupe) && (
                                      <button
                                        onClick={() => ouvrirAjout(j, m.cle, groupe)}
                                        className="no-print mt-1.5 text-[11px] text-zinc-400 hover:text-zinc-700"
                                      >
                                        + Ajouter
                                      </button>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}

      {modal && (
        <div
          className="no-print fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4"
          onClick={() => setModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-900">
                {GROUPE_LABELS[modal.groupe]} · {formatEnTeteJour(modal.date)}
              </p>
              <button
                onClick={() => setModal(null)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                ✕
              </button>
            </div>

            <label className="text-xs font-medium text-zinc-500">Activité</label>
            <input
              autoFocus
              value={modalLibelle}
              onChange={(e) => setModalLibelle(e.target.value)}
              placeholder="Ex: Chasse au trésor"
              className="mt-1 mb-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />

            <label className="text-xs font-medium text-zinc-500">
              Animateur(s) affecté(s) ce jour-là
            </label>
            <div className="mt-1 flex max-h-48 flex-col gap-1 overflow-y-auto">
              {animateursDuGroupe(modal.groupe, modal.date).length === 0 ? (
                <p className="text-sm text-zinc-400">
                  Aucun animateur affecté à ce groupe ce jour-là (page Répartition).
                </p>
              ) : (
                animateurs
                  .filter((a) => animateursDuGroupe(modal.groupe, modal.date).includes(a.id))
                  .map((a) => (
                    <label
                      key={a.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50"
                    >
                      <input
                        type="checkbox"
                        checked={modalAnimateurs.includes(a.id)}
                        onChange={(e) =>
                          setModalAnimateurs((prev) =>
                            e.target.checked
                              ? [...prev, a.id]
                              : prev.filter((id) => id !== a.id)
                          )
                        }
                      />
                      {a.prenom} {a.nom}
                    </label>
                  ))
              )}
            </div>

            <div className="mt-4 flex justify-between gap-2">
              {modal.activite ? (
                <button
                  onClick={() => {
                    supprimerActivite(modal.activite!.id);
                    setModal(null);
                  }}
                  className="text-sm text-red-500 hover:text-red-700"
                >
                  Supprimer
                </button>
              ) : (
                <span />
              )}
              <button
                onClick={enregistrerActivite}
                disabled={!modalLibelle.trim()}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
