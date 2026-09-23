import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

// Supprime un compte (auth.users + profiles, en cascade) — utilisé par un
// gestionnaire (global, ou scopé à l'établissement du compte visé).
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (id === user.id) {
    return NextResponse.json(
      { error: "Impossible de supprimer son propre compte depuis cette page." },
      { status: 400 }
    );
  }

  const [{ data: profile }, { data: cible }] = await Promise.all([
    supabase.from("profiles").select("role, etablissement_id").eq("id", user.id).single(),
    supabase.from("profiles").select("etablissement_id").eq("id", id).single(),
  ]);

  if (!cible) {
    return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });
  }

  const estGestionnaireGlobal = profile?.role === "gestionnaire" && !profile.etablissement_id;
  const estGestionnaireDeCetEtablissement =
    profile?.role === "gestionnaire" &&
    profile.etablissement_id &&
    profile.etablissement_id === cible.etablissement_id;
  if (!estGestionnaireGlobal && !estGestionnaireDeCetEtablissement) {
    return NextResponse.json(
      { error: "Réservé au gestionnaire de cet établissement." },
      { status: 403 }
    );
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY manquant côté serveur." },
      { status: 500 }
    );
  }
  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
