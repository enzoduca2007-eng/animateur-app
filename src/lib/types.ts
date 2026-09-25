export type Role =
  | "directeur"
  | "coordinateur"
  | "responsable"
  | "animateur"
  | "gestionnaire";

// N'inclut PAS "gestionnaire" : ce rôle n'est jamais choisi à
// l'inscription, uniquement créé à la main (voir migration_034).
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
  gestionnaire: "Gestionnaire",
};

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  groupe_coordinateur: Groupe | null;
  // Null uniquement pour un gestionnaire (accès transverse à tous les
  // établissements).
  etablissement_id: string | null;
  created_at: string;
}

export interface Etablissement {
  id: string;
  nom: string;
  created_by: string | null;
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
  arret_bus_depart_id: string | null;
  arret_bus_arrivee_id: string | null;
}

export interface GtfsStop {
  stop_id: string;
  stop_name: string;
  stop_lat: number | null;
  stop_lon: number | null;
  parent_station: string | null;
}

export interface BusOption {
  trip_id: string;
  route_short_name: string | null;
  heure_depart: string;
  heure_arrivee: string;
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

export interface VerrouPlanningSemaine {
  semaine_debut: string;
  verrouille_par: string | null;
  verrouille_at: string;
}

export interface PublicationPlanningSemaine {
  semaine_debut: string;
  publie_par: string | null;
  publie_at: string;
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
  cle: string;
  categorie: string;
  criteres: { cle: string; label: string }[];
}

export const CRITERES_STAGIAIRE: CategorieCriteresStagiaire[] = [
  {
    cle: "securite_cadre",
    categorie: "Sécurité et cadre",
    criteres: [
      { cle: "securite", label: "Assure la sécurité physique et morale des mineurs" },
      { cle: "hygiene_vie_collective", label: "Respecte les règles d'hygiène et de vie collective" },
      { cle: "cadre_reglementaire", label: "Respecte le cadre réglementaire et les règles de vie" },
    ],
  },
  {
    cle: "vie_quotidienne_groupe",
    categorie: "Vie quotidienne et vie de groupe",
    criteres: [
      { cle: "vie_quotidienne", label: "Encadre et anime la vie quotidienne (repas, temps calme, rangement...)" },
      { cle: "gestion_groupe", label: "Sait gérer un groupe d'enfants (autorité bienveillante, cadre posé)" },
      { cle: "rythmes_besoins", label: "Prend en compte les rythmes et besoins de chaque enfant" },
    ],
  },
  {
    cle: "relation_mineurs_familles",
    categorie: "Relation aux mineurs et aux familles",
    criteres: [
      { cle: "relation_mineurs", label: "Construit une relation de qualité avec les mineurs (écoute, respect)" },
      { cle: "relation_familles", label: "Participe à la relation avec les familles" },
      { cle: "communication", label: "Communique de façon claire et adaptée avec les enfants et l'équipe" },
    ],
  },
  {
    cle: "animation_pedagogie",
    categorie: "Animation et pédagogie",
    criteres: [
      { cle: "activites", label: "Conçoit, propose et met en œuvre des activités adaptées" },
      { cle: "creativite", label: "Fait preuve de créativité dans la conception des animations" },
      { cle: "bilan_activites", label: "Sait évaluer et faire le bilan de ses animations" },
      { cle: "projet_pedagogique", label: "Comprend et respecte le projet pédagogique de la structure" },
    ],
  },
  {
    cle: "posture_professionnelle",
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
  // Une appréciation par grande catégorie (clé = CategorieCriteresStagiaire.cle).
  appreciations_categories: Partial<Record<string, string>>;
  avis_final: AvisFinal | null;
  appreciation_generale: string | null;
  axes_progres: string | null;
  verrouille: boolean;
  verrouille_par: string | null;
  verrouille_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Auto-évaluation du stagiaire, remplie en ligne par lui-même — même
// grille de critères, fusionnée avec celle de la direction sur la
// feuille imprimée.
export interface AutoEvaluationStagiaire {
  id: string;
  animateur_id: string;
  criteres: Partial<Record<string, NiveauCritere>>;
  commentaire: string | null;
  created_at: string;
  updated_at: string;
}

// Fiche d'animation d'un grand jeu, remplie par le(s) animateur(s)
// assigné(s) depuis Mon planning — durée et matériel restent sur
// planning_activites (déjà existants), le reste vit ici.
export interface FicheAnimation {
  id: string;
  planning_activite_id: string;
  age: string | null;
  effectif: string | null;
  lieu: string | null;
  objectifs: string | null;
  sensibilisation: string | null;
  deroulement: string | null;
  conclusion_rangement: string | null;
  animateurs_requis: string | null;
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

export interface TrancheAge {
  id: string;
  etablissement_id: string;
  libelle: string;
  annee_naissance_min: number | null;
  annee_naissance_max: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Le premier id de animateur_ids est le "chauffeur" : seul dont les cases
// arrivée/départ restent modifiables sur Plannings — les autres suivent
// automatiquement et sont bloquées.
export interface Covoiturage {
  id: string;
  etablissement_id: string;
  nom: string | null;
  animateur_ids: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
  // null pour Lutins ; le groupe réel (encadrement/effectifs) reste
  // "trolls" pour Trolls et Géants, comme sur planning_activites.
  sous_groupe: SousGroupe | null;
  produit_id: string | null;
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

// Catalogue de produits de goûter (ex. "Bichocos") : pas de déclinaison
// par marque, une quantité/personne et une taille de paquet directement
// sur le produit.
export interface ProduitGouter {
  id: string;
  nom: string;
  quantite_par_personne: number;
  taille_paquet: number;
  actif: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Un produit prévu pour un bloc (Lutins/Trolls/Géants) un jour donné —
// plusieurs peuvent être prévus le même (jour, bloc), et commun_avec
// permet de partager le même goûter prévu avec 1 ou 2 autres blocs (ex.
// prévu pour Trolls, en commun avec Géants) sans le dupliquer.
export interface GouterPrevu {
  id: string;
  date: string;
  groupe: Groupe;
  sous_groupe: SousGroupe | null;
  commun_avec: ("lutins" | SousGroupe)[];
  produit_id: string;
  created_by: string | null;
  created_at: string;
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
  // Distingue Trolls de Géants sur le planning d'activités uniquement ;
  // null pour Lutins (le groupe réel reste "trolls" partout ailleurs).
  sous_groupe: SousGroupe | null;
  // Activité partagée avec un autre groupe/sous-groupe, purement indicatif.
  commun_avec: ("lutins" | SousGroupe)[];
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
