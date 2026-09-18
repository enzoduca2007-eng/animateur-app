"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { ROLES, ROLE_LABELS, type Profile, type Role } from "@/lib/types";

export default function EquipePage() {
  const profile = useProfile();
  const supabase = createClient();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("full_name");
    if (data) setProfiles(data as Profile[]);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRoleChange(id: string, role: Role) {
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, role } : p)));
    await supabase.from("profiles").update({ role }).eq("id", id);
    load();
  }

  if (profile.role !== "directeur") {
    return (
      <p className="text-sm text-zinc-500">
        Cette page est réservée aux directeurs.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Équipe</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Gère les espaces (directeur / coordinateur / responsable) de chaque
          compte.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Espace</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-zinc-400">
                  Chargement...
                </td>
              </tr>
            ) : (
              profiles.map((p) => (
                <tr key={p.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    {p.full_name}
                    {p.id === profile.id && (
                      <span className="ml-2 text-xs text-zinc-400">(toi)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{p.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={p.role}
                      onChange={(e) =>
                        handleRoleChange(p.id, e.target.value as Role)
                      }
                      className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
