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
  profile_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type Groupe = "lutins" | "trolls" | "geants";

export const GROUPES: Groupe[] = ["lutins", "trolls", "geants"];

export const GROUPE_LABELS: Record<Groupe, string> = {
  lutins: "Lutins",
  trolls: "Trolls",
  geants: "Géants",
};

export interface AffectationJour {
  id: string;
  date: string;
  animateur_id: string;
  groupe: Groupe;
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
