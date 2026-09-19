export type Role = "directeur" | "coordinateur" | "responsable" | "animateur";

export const ROLES: Role[] = [
  "directeur",
  "coordinateur",
  "responsable",
  "animateur",
];

export const ROLE_LABELS: Record<Role, string> = {
  directeur: "Directeur",
  coordinateur: "Coordinateur",
  responsable: "Responsable",
  animateur: "Animateur",
};

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  groupe_coordinateur: Groupe | null;
  created_at: string;
}

export interface Animateur {
  id: string;
  nom: string;
  prenom: string;
  email: string | null;
  telephone: string | null;
  diplomes: string | null;
  disponibilites: string | null;
  statut: string;
  est_stagiaire: boolean;
  stagiaire_confiance: boolean;
  date_naissance: string | null;
  notes: string | null;
  formation: string | null;
  profile_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type Groupe = "lutins" | "trolls";

export const GROUPES: Groupe[] = ["lutins", "trolls"];

export const GROUPE_LABELS: Record<Groupe, string> = {
  lutins: "Lutins",
  trolls: "Trolls & Géants",
};

export interface AffectationJour {
  id: string;
  date: string;
  animateur_id: string;
  groupe: Groupe;
  // Sous-étiquette purement visuelle (Répartition) pour distinguer Trolls
  // de Géants ; null pour Lutins. Le groupe réel reste "trolls" pour les
  // deux — ce champ n'affecte rien d'autre dans l'application.
  sous_groupe: "trolls" | "geants" | null;
  created_by: string | null;
  created_at: string;
}

export type TypeCreneau = "arrivee" | "pause" | "depart";

export const TYPE_CRENEAU_LABELS: Record<TypeCreneau, string> = {
  arrivee: "Arrivées",
  pause: "Pauses",
  depart: "Départs",
};

export interface Creneau {
  id: string;
  libelle: string;
  type: TypeCreneau;
  heure_debut: string; // "HH:MM:SS"
  heure_fin: string | null; // requis pour les pauses
  ordre: number;
  created_at: string;
}

export interface AffectationCreneau {
  id: string;
  date: string;
  creneau_id: string;
  animateur_id: string;
  created_by: string | null;
  created_at: string;
}

export interface JourFermeture {
  id: string;
  date: string;
  motif: string | null;
  created_at: string;
}

export interface EffectifJour {
  id: string;
  date: string;
  groupe: Groupe;
  effectif: number;
  created_by: string | null;
  created_at: string;
}

export interface PresenceJour {
  id: string;
  animateur_id: string;
  date: string;
  present: boolean;
  created_by: string | null;
  created_at: string;
}

export interface PalierEncadrement {
  id: string;
  effectif_min: number;
  nb_animateurs: number;
  created_at: string;
}

export interface FeuilleTemps {
  id: string;
  date: string;
  animateur_id: string;
  present: boolean;
  motif_absence: string | null;
  heure_arrivee_reelle: string | null;
  heure_depart_reelle: string | null;
  commentaire: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type StatutIaGouter = "en_attente" | "traite" | "echec";

export interface Gouter {
  id: string;
  date: string;
  groupe: Groupe;
  type_produit: string | null;
  marque: string | null;
  photo_url: string | null;
  nom_produit: string | null;
  numero_lot: string | null;
  date_peremption: string | null;
  quantite: string | null;
  statut_ia: StatutIaGouter;
  erreur_ia: string | null;
  created_by: string | null;
  rempli_par: string | null;
  created_at: string;
  updated_at: string;
}

export type MomentActivite = "matin" | "temps_calme" | "apres_midi";

export const MOMENTS_ACTIVITE: { cle: MomentActivite; label: string }[] = [
  { cle: "matin", label: "Matin" },
  { cle: "temps_calme", label: "Temps calme" },
  { cle: "apres_midi", label: "Après-midi" },
];

export type TypeActivite = "grand_jeu" | "manuelle" | "jeu" | "autre";

export const TYPE_ACTIVITE_LABELS: Record<TypeActivite, string> = {
  grand_jeu: "Grand jeu",
  manuelle: "Activité manuelle",
  jeu: "Jeu",
  autre: "Autre",
};

export const TYPE_ACTIVITE_EMOJIS: Record<TypeActivite, string> = {
  grand_jeu: "🏆",
  manuelle: "🎨",
  jeu: "🎲",
  autre: "📌",
};

export interface PlanningActivite {
  id: string;
  date: string;
  groupe: Groupe;
  moment: MomentActivite;
  ordre: number;
  type_activite: TypeActivite | null;
  duree: string | null;
  materiel: string | null;
  libelle: string;
  animateur_ids: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ThemeSemaine {
  id: string;
  groupe: Groupe;
  semaine_debut: string;
  theme: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  auteur_id: string;
  contenu: string;
  created_at: string;
  profiles?: { full_name: string; role: Role } | null;
}

export function canManage(role: Role | undefined | null) {
  return role === "directeur" || role === "coordinateur";
}
