"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/types";

// Tous les espaces possibles à la connexion, y compris "gestionnaire" —
// qui n'est volontairement pas dans ROLES (jamais choisi à l'inscription)
// mais reste un rôle de compte existant qu'il faut pouvoir sélectionner ici.
const ESPACES: Role[] = [...ROLES, "gestionnaire"];

export default function LoginPage() {
  const router = useRouter();
  const [espace, setEspace] = useState<Role | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!espace) return;
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      setError(
        error.message === "Invalid login credentials"
          ? "Email ou mot de passe incorrect."
          : error.message
      );
      return;
    }

    // Le rôle choisi ("espace") devient le rôle effectif de la session —
    // échoue si ce compte n'a pas le droit de l'endosser (ni rôle
    // principal, ni rôle secondaire autorisé).
    const { error: roleError } = await supabase.rpc("definir_role_actif", {
      p_role: espace,
    });

    if (roleError) {
      await supabase.auth.signOut();
      setLoading(false);
      setError(`Ce compte n'a pas accès à l'espace ${ROLE_LABELS[espace]}.`);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">Connexion</h1>

        {!espace ? (
          <>
            <p className="mt-1 text-sm text-zinc-500">
              Quel espace veux-tu rejoindre ?
            </p>
            <div className="mt-6 flex flex-col gap-2">
              {ESPACES.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setEspace(role)}
                  className="rounded-md border border-zinc-300 px-4 py-2.5 text-left text-sm font-medium text-zinc-900 hover:border-zinc-500 hover:bg-zinc-50"
                >
                  {ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-zinc-500">
              Espace {ROLE_LABELS[espace]} —{" "}
              <button
                type="button"
                onClick={() => {
                  setEspace(null);
                  setError(null);
                }}
                className="underline hover:text-zinc-900"
              >
                changer
              </button>
            </p>

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-zinc-700">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700">
                  Mot de passe
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {loading ? "Connexion..." : "Se connecter"}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-sm text-zinc-500">
          Pas encore de compte ?{" "}
          <Link href="/signup" className="font-medium text-zinc-900 underline">
            Créer un compte
          </Link>
        </p>
      </div>
    </div>
  );
}
