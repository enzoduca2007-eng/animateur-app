export function age(dateNaissance: string, dateReference: string): number {
  const [ry, rm, rd] = dateReference.split("-").map(Number);
  const [by, bm, bd] = dateNaissance.split("-").map(Number);
  let a = ry - by;
  if (rm < bm || (rm === bm && rd < bd)) a--;
  return a;
}

/** null = âge inconnu (pas de date de naissance renseignée). */
export function estMineur(
  dateNaissance: string | null,
  dateReference: string
): boolean | null {
  if (!dateNaissance) return null;
  return age(dateNaissance, dateReference) < 18;
}

/**
 * Plafond hebdomadaire. Par défaut (âge inconnu) : plafond majeur.
 * `plafonds` vient des paramètres de l'établissement (modifiable par le
 * gestionnaire) ; à défaut, valeurs par défaut 40h mineur / 45h majeur.
 */
export function plafondHeuresSemaine(
  mineur: boolean | null,
  plafonds?: { mineur: number; majeur: number }
) {
  const p = plafonds ?? { mineur: 40, majeur: 45 };
  return mineur ? p.mineur : p.majeur;
}

/**
 * Un stagiaire "de confiance" peut ouvrir/fermer seul comme un
 * non-stagiaire ; un stagiaire ordinaire ne le peut pas.
 */
export function peutOuvrirFermerSeul(a: {
  est_stagiaire: boolean;
  stagiaire_confiance: boolean;
}) {
  return !a.est_stagiaire || a.stagiaire_confiance;
}
