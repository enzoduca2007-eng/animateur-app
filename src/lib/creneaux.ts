import type { Creneau } from "@/lib/types";

export function toMinutes(heure: string) {
  const [h, m] = heure.split(":").map(Number);
  return h * 60 + m;
}

export function pauseMinutes(creneauxAssignes: Creneau[]) {
  return creneauxAssignes
    .filter((c) => c.type === "pause" && c.heure_fin)
    .reduce(
      (total, c) => total + (toMinutes(c.heure_fin!) - toMinutes(c.heure_debut)),
      0
    );
}

/**
 * Heures travaillées un jour donné pour un animateur, à partir des créneaux
 * qui lui sont affectés ce jour-là : de sa première arrivée à son dernier
 * départ, moins la durée de ses pauses. Renvoie null si l'arrivée ou le
 * départ manque (journée incomplète, pas encore calculable).
 */
export function heuresJour(
  creneauxAssignes: Creneau[]
): number | null {
  const arrivees = creneauxAssignes.filter((c) => c.type === "arrivee");
  const departs = creneauxAssignes.filter((c) => c.type === "depart");
  if (arrivees.length === 0 || departs.length === 0) return null;

  const debut = Math.min(...arrivees.map((c) => toMinutes(c.heure_debut)));
  const fin = Math.max(...departs.map((c) => toMinutes(c.heure_debut)));

  const pause = pauseMinutes(creneauxAssignes);

  return Math.max(0, (fin - debut - pause) / 60);
}

export function formatHeures(h: number) {
  const heures = Math.floor(h);
  const minutes = Math.round((h - heures) * 60);
  return minutes === 0 ? `${heures}h` : `${heures}h${String(minutes).padStart(2, "0")}`;
}
