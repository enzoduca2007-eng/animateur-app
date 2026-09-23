import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { ROLES, type Role } from "@/lib/types";

const ROLES_VALIDES: Role[] = [...ROLES, "gestionnaire"];

// Crée un compte pour un établissement donné — utilisé par un gestionnaire
// (global, ou scopé à ce même établissement) pour ajouter des comptes
// (directeur, coordinateur, responsable, animateur ou même un autre
// gestionnaire) sans passer par l'auto-inscription.
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

  const { etablissementId, nom, email, password, role } = await request.json();

  const estGestionnaireGlobal = profile?.role === "gestionnaire" && !profile.etablissement_id;
  const estGestionnaireDeCetEtablissement =
    profile?.role === "gestionnaire" && profile.etablissement_id === etablissementId;
  if (!estGestionnaireGlobal && !estGestionnaireDeCetEtablissement) {
    return NextResponse.json(
      { error: "Réservé au gestionnaire de cet établissement." },
      { status: 403 }
    );
  }

  if (!etablissementId || !nom || !email || !password || !role) {
    return NextResponse.json({ error: "Tous les champs sont requis." }, { status: 400 });
  }
  if (!ROLES_VALIDES.includes(role)) {
    return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY manquant côté serveur." },
      { status: 500 }
    );
  }
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);

  // handle_new_user() refuse "gestionnaire" dans les métadonnées d'inscription
  // (anti auto-promotion) : on crée avec un rôle neutre puis on promeut
  // ensuite si besoin, via le client admin qui contourne ce garde-fou.
  const { data: created, error: errUser } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: nom,
      role: role === "gestionnaire" ? "responsable" : role,
      etablissement_id: etablissementId,
    },
  });

  if (errUser || !created.user) {
    return NextResponse.json(
      { error: errUser?.message ?? "Échec de création du compte." },
      { status: 400 }
    );
  }

  if (role === "gestionnaire") {
    const { error: errPromotion } = await admin
      .from("profiles")
      .update({ role: "gestionnaire" })
      .eq("id", created.user.id);
    if (errPromotion) {
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: errPromotion.message }, { status: 400 });
    }
  }

  return NextResponse.json({ id: created.user.id });
}
