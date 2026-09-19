"use client";

import { useState } from "react";
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
  { href: "/dashboard/activites", label: "Activités", roles: STAFF },
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
  const [ouvert, setOuvert] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Barre du haut, uniquement sur mobile/tablette */}
      <div className="no-print flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 md:hidden">
        <span className="font-semibold text-zinc-900">Animateurs</span>
        <button
          onClick={() => setOuvert(true)}
          aria-label="Ouvrir le menu"
          className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Fond assombri derrière le menu ouvert sur mobile */}
      {ouvert && (
        <div
          className="no-print fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setOuvert(false)}
        />
      )}

      <aside
        className={`no-print fixed inset-y-0 left-0 z-50 w-64 shrink-0 flex-col border-r border-zinc-200 bg-white md:static md:z-auto md:flex md:w-56 ${
          ouvert ? "flex" : "hidden"
        }`}
      >
        <div className="hidden px-5 py-4 md:block">
          <span className="font-semibold text-zinc-900">Animateurs</span>
        </div>
        <div className="flex items-center justify-between px-5 py-4 md:hidden">
          <span className="font-semibold text-zinc-900">Animateurs</span>
          <button
            onClick={() => setOuvert(false)}
            aria-label="Fermer le menu"
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {LINKS.filter(
            (link) => !link.roles || link.roles.includes(profile.role)
          ).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOuvert(false)}
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
    </>
  );
}
