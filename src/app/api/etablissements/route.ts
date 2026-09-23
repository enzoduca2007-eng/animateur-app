import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

// Créneaux/paliers par défaut, repris de la configuration historique de
// MJC Étoile — un nouvel établissement part avec les mêmes réglages, que
// son directeur pourra ensuite ajuster depuis Plannings.
const CRENEAUX_PAR_DEFAUT = [
  { libelle: "7h20", type: "arrivee", heure_debut: "07:20", ordre: 1 },
  { libelle: "8h", type: "arrivee", heure_debut: "08:00", ordre: 2 },
  { libelle: "8h30", type: "arrivee", heure_debut: "08:30", ordre: 3 },
  { libelle: "11h30-12h30", type: "pause", heure_debut: "11:30", heure_fin: "12:30", ordre: 1 },
  { libelle: "12h30-13h30", type: "pause", heure_debut: "12:30", heure_fin: "13:30", ordre: 2 },
  { libelle: "13h-14h", type: "pause", heure_debut: "13:00", heure_fin: "14:00", ordre: 3 },
  { libelle: "13h30-14h30", type: "pause", heure_debut: "13:30", heure_fin: "14:30", ordre: 4 },
  { libelle: "17h", type: "depart", heure_debut: "17:00", ordre: 1 },
  { libelle: "17h30", type: "depart", heure_debut: "17:30", ordre: 2 },
  { libelle: "Fermeture 18h", type: "depart", heure_debut: "18:00", ordre: 3 },
  { libelle: "Fermeture 18h30", type: "depart", heure_debut: "18:30", ordre: 4 },
];

const PALIERS_PAR_DEFAUT = [
  { effectif_min: 0, nb_animateurs: 1 },
  { effectif_min: 16, nb_animateurs: 2 },
  { effectif_min: 31, nb_animateurs: 3 },
];

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, etablissement_id")
    .eq("id", user.id)
    .single();
  // Seul le gestionnaire GLOBAL (sans établissement) peut créer un nouvel
  // établissement — un gestionnaire scopé à un établissement (super
  // directeur local) ne peut pas en créer d'autres.
  if (profile?.role !== "gestionnaire" || profile.etablissement_id) {
    return NextResponse.json(
      { error: "Réservé au compte gestionnaire global." },
      { status: 403 }
    );
  }

  const {
    nomEtablissement,
    gestionnaireNom,
    gestionnaireEmail,
    gestionnairePassword,
  } = await request.json();
  if (!nomEtablissement || !gestionnaireNom || !gestionnaireEmail || !gestionnairePassword) {
    return NextResponse.json(
      { error: "Tous les champs sont requis." },
      { status: 400 }
    );
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY manquant côté serveur." },
      { status: 500 }
    );
  }
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  const { data: etablissement, error: errEtablissement } = await admin
    .from("etablissements")
    .insert({ nom: nomEtablissement, created_by: user.id })
    .select()
    .single();
  if (errEtablissement || !etablissement) {
    return NextResponse.json(
      { error: errEtablissement?.message ?? "Échec de création de l'établissement." },
      { status: 400 }
    );
  }

  const { error: errCreneaux } = await admin
    .from("creneaux")
    .insert(
      CRENEAUX_PAR_DEFAUT.map((c) => ({ ...c, etablissement_id: etablissement.id }))
    );
  const { error: errPaliers } = errCreneaux
    ? { error: null }
    : await admin
        .from("paliers_encadrement")
        .insert(
          PALIERS_PAR_DEFAUT.map((p) => ({ ...p, etablissement_id: etablissement.id }))
        );

  if (errCreneaux || errPaliers) {
    await admin.from("etablissements").delete().eq("id", etablissement.id);
    return NextResponse.json(
      { error: errCreneaux?.message ?? errPaliers?.message },
      { status: 400 }
    );
  }

  // handle_new_user() refuse volontairement de créer un compte
  // "gestionnaire" à partir des métadonnées d'inscription (pour bloquer
  // toute auto-inscription en gestionnaire) — on crée donc d'abord le
  // compte avec un rôle neutre, puis on le promeut en gestionnaire juste
  // après via une simple mise à jour (le client admin contourne RLS et le
  // trigger anti-auto-promotion, qui ne s'applique qu'aux requêtes
  // authentifiées comme un utilisateur normal).
  const { data: created, error: errUser } = await admin.auth.admin.createUser({
    email: gestionnaireEmail,
    password: gestionnairePassword,
    email_confirm: true,
    user_metadata: {
      full_name: gestionnaireNom,
      role: "responsable",
      etablissement_id: etablissement.id,
    },
  });

  if (errUser || !created.user) {
    await admin.from("etablissements").delete().eq("id", etablissement.id);
    return NextResponse.json(
      { error: errUser?.message ?? "Échec de création du compte." },
      { status: 400 }
    );
  }

  const { error: errPromotion } = await admin
    .from("profiles")
    .update({ role: "gestionnaire" })
    .eq("id", created.user.id);

  if (errPromotion) {
    await admin.auth.admin.deleteUser(created.user.id);
    await admin.from("etablissements").delete().eq("id", etablissement.id);
    return NextResponse.json({ error: errPromotion.message }, { status: 400 });
  }

  return NextResponse.json({ etablissement, gestionnaireId: created.user.id });
}
