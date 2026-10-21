import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileProvider } from "@/lib/profile-context";
import { DashboardNav } from "./nav";
import { PreparationImpression } from "@/components/preparation-impression";
import type { Profile } from "@/lib/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile) {
    redirect("/login");
  }

  // Le rôle effectif pour cette session peut différer du rôle principal
  // stocké sur le profil (voir migration_059 : un compte peut choisir un
  // rôle secondaire à la connexion). current_role_name() est la même
  // fonction qui pilote les permissions côté base — on s'aligne dessus
  // pour que la nav affichée corresponde à ce que le compte a le droit de
  // faire.
  const { data: roleActif } = await supabase.rpc("current_role_name");
  const profilAffiche = roleActif ? { ...profile, role: roleActif } : profile;

  return (
    <ProfileProvider profile={profilAffiche}>
      <PreparationImpression />
      <div className="flex min-h-screen flex-1 flex-col md:flex-row print:block print:min-h-0">
        <DashboardNav />
        <main className="mx-auto w-full max-w-5xl flex-1 overflow-x-hidden px-3 py-5 sm:px-4 md:py-8 print:max-w-none print:overflow-visible print:p-0">
          {children}
        </main>
      </div>
    </ProfileProvider>
  );
}
