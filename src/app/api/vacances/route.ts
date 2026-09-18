import { NextResponse } from "next/server";
import type { PeriodeVacances } from "@/lib/vacances";

export const revalidate = 43200; // 12h — les dates officielles ne changent pas souvent

const VILLE_PAR_ZONE: Record<string, string> = {
  A: "Lyon",
  B: "Lille",
  C: "Paris",
};

interface Record_ {
  fields: {
    description: string;
    start_date: string;
    end_date: string;
    annee_scolaire: string;
  };
}

function toDateLocale(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function anneeScolaire(date: Date) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1; // 1-12
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

async function fetchAnnee(zone: string, ville: string, annee: string) {
  const url = new URL(
    "https://data.education.gouv.fr/api/records/1.0/search/"
  );
  url.searchParams.set("dataset", "fr-en-calendrier-scolaire");
  url.searchParams.set(
    "q",
    `zones:"Zone ${zone}" AND location:"${ville}"`
  );
  url.searchParams.set("refine.annee_scolaire", annee);
  url.searchParams.set("rows", "30");
  url.searchParams.set("sort", "start_date");

  const res = await fetch(url, { next: { revalidate } });
  if (!res.ok) return [];
  const json = (await res.json()) as { records?: Record_[] };
  return json.records ?? [];
}

export async function GET() {
  const zone = (process.env.NEXT_PUBLIC_ZONE_SCOLAIRE || "A").toUpperCase();
  const ville = VILLE_PAR_ZONE[zone] ?? VILLE_PAR_ZONE.A;

  const now = new Date();
  const anneeActuelle = anneeScolaire(now);
  const anneeSuivante = anneeScolaire(
    new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), 1))
  );

  const [recordsA, recordsB] = await Promise.all([
    fetchAnnee(zone, ville, anneeActuelle),
    fetchAnnee(zone, ville, anneeSuivante),
  ]);

  const parPeriode = new Map<string, PeriodeVacances>();

  for (const r of [...recordsA, ...recordsB]) {
    const description = r.fields.description;
    // On ne garde que les vraies périodes de vacances (pas les "Début de...",
    // "Fin de..." ni les ponts qui sont des marqueurs 1 jour).
    if (!description.startsWith("Vacances")) continue;

    const debut = toDateLocale(r.fields.start_date);
    const fin = toDateLocale(r.fields.end_date);
    const key = `${description}-${r.fields.annee_scolaire}`;
    const existing = parPeriode.get(key);

    if (!existing) {
      parPeriode.set(key, { description, debut, fin });
    } else {
      // Plusieurs enregistrements pour la même période (rentrées décalées
      // selon les niveaux) : on prend l'intervalle le plus large.
      existing.debut = existing.debut < debut ? existing.debut : debut;
      existing.fin = existing.fin > fin ? existing.fin : fin;
    }
  }

  // Le champ end_date du jeu de données officiel correspond en réalité au
  // jour de la rentrée (repris à l'école), pas au dernier jour de vacances
  // — il faut donc reculer d'un jour pour avoir la vraie fin des vacances.
  for (const p of parPeriode.values()) {
    const veille = new Date(`${p.fin}T00:00:00Z`);
    veille.setUTCDate(veille.getUTCDate() - 1);
    p.fin = veille.toISOString().slice(0, 10);
  }

  const aujourdhui = toDateLocale(now.toISOString());
  const periodes = [...parPeriode.values()]
    .filter((p) => p.fin >= aujourdhui)
    .sort((a, b) => a.debut.localeCompare(b.debut));

  return NextResponse.json({ zone, periodes });
}
