"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { ROLE_LABELS, type Role } from "@/lib/types";

const STAFF: Role[] = ["directeur", "coordinateur", "responsable"];

const LINKS: { href: string; label: string; roles: Role[] | null }[] = [
  { href: "/dashboard", label: "Accueil", roles: STAFF },
  { href: "/dashboard/mon-planning", label: "Mon planning", roles: ["animateur", "coordinateur"] },
  { href: "/dashboard/animateurs", label: "Animateurs", roles: STAFF },
  { href: "/dashboard/plannings", label: "Plannings", roles: STAFF },
  { href: "/dashboard/repartition", label: "Répartition", roles: STAFF },
  { href: "/dashboard/fiches-horaires", label: "Fiches horaires", roles: STAFF },
  { href: "/dashboard/gouters", label: "Goûters", roles: null },
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
    <aside className="no-print flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="px-5 py-4">
        <span className="font-semibold text-zinc-900">Animateurs</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {LINKS.filter(
          (link) => !link.roles || link.roles.includes(profile.role)
        ).map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-2 text-sm ${
              pathname === link.href
                ? "bg-zinc-100 font-medium text-zinc-900"
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-2 border-t border-zinc-200 px-4 py-4 text-sm">
        <span className="text-zinc-500">
          {profile.full_name}
          <br />
          <span className="mt-1 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
            {ROLE_LABELS[profile.role]}
          </span>
        </span>
        <button
          onClick={handleSignOut}
          className="text-left text-zinc-500 hover:text-zinc-900"
        >
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
