"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { type Groupe, type Profile, type Role } from "@/lib/types";

// Code court tapé au clavier plutôt que deux menus déroulants (Espace +
// Groupe géré) — un peu comme les lettres L/T/G/D/A de la Répartition.
// "C" seul = coordinateur non restreint (tous les groupes).
function parseCode(saisie: string): { role: Role; groupe_coordinateur: Groupe | null } | null {
  const code = saisie.trim().toUpperCase();
  if (code === "D") return { role: "directeur", groupe_coordinateur: null };
  if (code === "A") return { role: "animateur", groupe_coordinateur: null };
  if (code === "R") return { role: "responsable", groupe_coordinateur: null };
  if (code === "C") return { role: "coordinateur", groupe_coordinateur: null };
  const sansC = code.startsWith("C") ? code.slice(1) : code;
  if (sansC === "L") return { role: "coordinateur", groupe_coordinateur: "lutins" };
  if (["T", "G", "TG", "GT"].includes(sansC)) {
    return { role: "coordinateur", groupe_coordinateur: "trolls" };
  }
  return null;
}

function codeDe(p: Profile): string {
  if (p.role === "directeur") return "D";
  if (p.role === "animateur") return "A";
  if (p.role === "responsable") return "R";
  if (p.role === "coordinateur") {
    if (p.groupe_coordinateur === "lutins") return "CL";
    if (p.groupe_coordinateur === "trolls") return "CTG";
    return "C";
  }
  return "";
}

export default function EquipePage() {
  const profile = useProfile();
  const supabase = createClient();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreurs, setErreurs] = useState<Record<string, boolean>>({});

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

  async function handleCodeChange(id: string, saisie: string) {
    const parsed = parseCode(saisie);
    if (!parsed) {
      setErreurs((prev) => ({ ...prev, [id]: true }));
      return;
    }
    setErreurs((prev) => ({ ...prev, [id]: false }));
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...parsed } : p)));
    await supabase.from("profiles").update(parsed).eq("id", id);
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
          Gère les espaces de chaque compte avec un code court : D = Directeur
          · A = Animateur · R = Responsable · C = Coordinateur (tous les
          groupes) · CL = Coordinateur Lutins · CTG = Coordinateur Trolls &amp;
          Géants.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full min-w-[480px] text-left text-sm">
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
                    <input
                      key={`${p.id}-${codeDe(p)}`}
                      defaultValue={codeDe(p)}
                      onBlur={(e) => handleCodeChange(p.id, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      maxLength={3}
                      title="D, A, R, C, CL, CTG"
                      className={`h-8 w-16 rounded-md border px-2 text-center text-sm font-semibold uppercase focus:outline-none ${
                        erreurs[p.id]
                          ? "border-red-400 bg-red-50 text-red-700"
                          : "border-zinc-300 focus:border-zinc-500"
                      }`}
                    />
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
