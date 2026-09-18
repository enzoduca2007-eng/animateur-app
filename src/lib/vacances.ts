export interface PeriodeVacances {
  description: string;
  debut: string; // YYYY-MM-DD, inclusive
  fin: string; // YYYY-MM-DD, inclusive
}

// Compare as plain strings: YYYY-MM-DD sorts chronologically.
export function estJourOuvert(dateISO: string, periodes: PeriodeVacances[]) {
  return periodes.some((p) => dateISO >= p.debut && dateISO <= p.fin);
}

export function joursDe(periode: PeriodeVacances): string[] {
  const jours: string[] = [];
  const debut = new Date(`${periode.debut}T00:00:00Z`);
  const fin = new Date(`${periode.fin}T00:00:00Z`);
  for (let d = debut; d <= fin; d = new Date(d.getTime() + 86400000)) {
    jours.push(d.toISOString().slice(0, 10));
  }
  return jours;
}

export function estWeekend(dateISO: string) {
  const jour = new Date(`${dateISO}T00:00:00Z`).getUTCDay();
  return jour === 0 || jour === 6; // dimanche ou samedi
}

export function periodeEnCours(
  periodes: PeriodeVacances[],
  aujourdhui: string
) {
  return (
    periodes.find((p) => aujourdhui >= p.debut && aujourdhui <= p.fin) ??
    periodes.find((p) => p.fin >= aujourdhui) ??
    periodes[0]
  );
}
