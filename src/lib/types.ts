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

export type SousGroupe = "trolls" | "geants";

export interface EffectifSousGroupe {
  id: string;
  date: string;
  sous_groupe: SousGroupe;
  effectif: number;
  created_by: string | null;
  created_at: string;
}

export type SectionDirection = "lutins" | "trolls" | "geants";
export type RoleAffiche = "directeur" | "directeur_adjoint" | "coordinateur";

export interface DirectionRoster {
  id: string;
  animateur_id: string;
  role_affiche: RoleAffiche;
  // Un coordinateur peut gérer plusieurs groupes à la fois.
  sections: SectionDirection[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Présence jour par jour du directeur/directeur adjoint sur la feuille de
// Répartition (saisie D/A dans la grille) — distincte des affectations de
// groupe (L/T/G) car un directeur n'appartient à aucun groupe réel.
export type RoleDirectionJour = "directeur" | "adjoint";

export interface PresenceDirectionJour {
  id: string;
  date: string;
  animateur_id: string;
  role: RoleDirectionJour;
  created_by: string | null;
  created_at: string;
}

// Grille d'évaluation BAFA (stage pratique) — inspirée des domaines de
// compétences officiels, simplifiée à 4 niveaux par critère.
export type NiveauCritere = "a_travailler" | "en_cours" | "acquis" | "depasse";

export const NIVEAUX_CRITERE: NiveauCritere[] = ["a_travailler", "en_cours", "acquis", "depasse"];

export const NIVEAU_CRITERE_LABELS: Record<NiveauCritere, string> = {
  a_travailler: "À travailler",
  en_cours: "En cours d'acquisition",
  acquis: "Acquis",
  depasse: "Dépassé",
};

export const NIVEAU_CRITERE_ABBREV: Record<NiveauCritere, string> = {
  a_travailler: "AT",
  en_cours: "ECA",
  acquis: "A",
  depasse: "D",
};

export interface CategorieCriteresStagiaire {
  categorie: string;
  criteres: { cle: string; label: string }[];
}

export const CRITERES_STAGIAIRE: CategorieCriteresStagiaire[] = [
  {
    categorie: "Sécurité et cadre",
    criteres: [
      { cle: "securite", label: "Assure la sécurité physique et morale des mineurs" },
      { cle: "hygiene_vie_collective", label: "Respecte les règles d'hygiène et de vie collective" },
      { cle: "cadre_reglementaire", label: "Respecte le cadre réglementaire et les règles de vie" },
    ],
  },
  {
    categorie: "Vie quotidienne et vie de groupe",
    criteres: [
      { cle: "vie_quotidienne", label: "Encadre et anime la vie quotidienne (repas, temps calme, rangement...)" },
      { cle: "gestion_groupe", label: "Sait gérer un groupe d'enfants (autorité bienveillante, cadre posé)" },
      { cle: "rythmes_besoins", label: "Prend en compte les rythmes et besoins de chaque enfant" },
    ],
  },
  {
    categorie: "Relation aux mineurs et aux familles",
    criteres: [
      { cle: "relation_mineurs", label: "Construit une relation de qualité avec les mineurs (écoute, respect)" },
      { cle: "relation_familles", label: "Participe à la relation avec les familles" },
      { cle: "communication", label: "Communique de façon claire et adaptée avec les enfants et l'équipe" },
    ],
  },
  {
    categorie: "Animation et pédagogie",
    criteres: [
      { cle: "activites", label: "Conçoit, propose et met en œuvre des activités adaptées" },
      { cle: "creativite", label: "Fait preuve de créativité dans la conception des animations" },
      { cle: "bilan_activites", label: "Sait évaluer et faire le bilan de ses animations" },
      { cle: "projet_pedagogique", label: "Comprend et respecte le projet pédagogique de la structure" },
    ],
  },
  {
    categorie: "Posture professionnelle",
    criteres: [
      { cle: "vie_equipe", label: "S'implique dans la vie de l'équipe (communication, entraide)" },
      { cle: "autonomie", label: "Fait preuve d'autonomie et de prise d'initiative" },
      { cle: "ponctualite", label: "Ponctualité et assiduité" },
      { cle: "remise_en_question", label: "Sait se remettre en question, accepte les conseils et la critique" },
      { cle: "adaptation", label: "S'adapte aux imprévus et aux changements" },
    ],
  },
];

export type AvisFinal = "favorable" | "reserve" | "defavorable";

export const AVIS_FINAL_LABELS: Record<AvisFinal, string> = {
  favorable: "Favorable",
  reserve: "Réservé",
  defavorable: "Défavorable",
};

export interface EvaluationStagiaire {
  id: string;
  animateur_id: string;
  criteres: Partial<Record<string, NiveauCritere>>;
  avis_final: AvisFinal | null;
  appreciation_generale: string | null;
  axes_progres: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
