export type Role = "directeur" | "coordinateur" | "responsable";

export const ROLES: Role[] = ["directeur", "coordinateur", "responsable"];

export const ROLE_LABELS: Record<Role, string> = {
  directeur: "Directeur",
  coordinateur: "Coordinateur",
  responsable: "Responsable",
};

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  created_at: string;
}

export interface Animateur {
  id: string;
  nom: string;
  prenom: string;
  email: string | null;
  telephone: string | null;
  diplomes: string | null;
  groupe: string | null;
  disponibilites: string | null;
  statut: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Planning {
  id: string;
  titre: string;
  date: string;
  heure_debut: string | null;
  heure_fin: string | null;
  lieu: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
  planning_animateurs?: { animateur_id: string }[];
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
