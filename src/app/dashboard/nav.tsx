"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { ROLE_LABELS, type Role } from "@/lib/types";

const STAFF: Role[] = ["directeur", "coordinateur", "responsable"];

const LINKS: { href: string; label: string; roles: Role[] | null }[] = [
  { href: "/dashboard", label: "Accueil", roles: STAFF },
  { href: "/dashboard/mon-planning", label: "Mon planning", roles: ["animateur"] },
  { href: "/dashboard/animateurs", label: "Animateurs", roles: STAFF },
  { href: "/dashboard/plannings", label: "Plannings", roles: STAFF },
  { href: "/dashboard/repartition", label: "Répartition", roles: STAFF },
  { href: "/dashboard/fiches-horaires", label: "Fiches horaires", roles: STAFF },
  { href: "/dashboard/messages", label: "Messages", roles: null },
  { href: "/dashboard/equipe", label: "Équipe", roles: ["directeur"] },
];

export function DashboardNav() {
  const profile = useProfile();
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="no-print border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-zinc-900">Animateurs</span>
          <nav className="flex gap-4 text-sm">
            {LINKS.filter(
              (link) => !link.roles || link.roles.includes(profile.role)
            ).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={
                  pathname === link.href
                    ? "font-medium text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-900"
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500">
            {profile.full_name}{" "}
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
              {ROLE_LABELS[profile.role]}
            </span>
          </span>
          <button
            onClick={handleSignOut}
            className="text-zinc-500 hover:text-zinc-900"
          >
            Déconnexion
          </button>
        </div>
      </div>
    </header>
  );
}
