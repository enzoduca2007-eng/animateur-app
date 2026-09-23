import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

interface MessagePreview {
  id: string;
  contenu: string;
  created_at: string;
  profiles: { full_name: string } | null;
}

export default async function DashboardHome() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, etablissement_id")
      .eq("id", user.id)
      .single();
    if (profile?.role === "animateur") {
      redirect("/dashboard/mon-planning");
    }
    if (profile?.role === "gestionnaire") {
      // Un gestionnaire scopé à un établissement atterrit directement sur
      // ses propres paramètres ; le gestionnaire global (sans
      // établissement) voit la liste de tous les établissements.
      redirect(
        profile.etablissement_id
          ? `/dashboard/etablissements/${profile.etablissement_id}`
          : "/dashboard/etablissements"
      );
    }
  }

  const [{ count: nbAnimateurs }, { count: nbAffectations }, { data: messages }] =
    await Promise.all([
      supabase.from("animateurs").select("*", { count: "exact", head: true }),
      supabase
        .from("affectations_creneau")
        .select("*", { count: "exact", head: true })
        .gte("date", new Date().toISOString().slice(0, 10)),
      supabase
        .from("messages")
        .select("id, contenu, created_at, profiles(full_name, role)")
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

  const recentMessages = (messages ?? []) as unknown as MessagePreview[];

  const cards = [
    {
      href: "/dashboard/animateurs",
      label: "Animateurs",
      value: nbAnimateurs ?? 0,
      hint: "au total",
    },
    {
      href: "/dashboard/plannings",
      label: "Créneaux affectés à venir",
      value: nbAffectations ?? 0,
      hint: "à partir d'aujourd'hui",
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Tableau de bord</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Vue d&apos;ensemble de la gestion des animateurs.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-zinc-300"
          >
            <p className="text-sm text-zinc-500">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold text-zinc-900">
              {card.value}
            </p>
            <p className="mt-1 text-xs text-zinc-400">{card.hint}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-zinc-900">Derniers messages</h2>
          <Link
            href="/dashboard/messages"
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            Voir tout
          </Link>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {recentMessages.length > 0 ? (
            recentMessages.map((m) => (
              <div key={m.id} className="text-sm">
                <span className="font-medium text-zinc-900">
                  {m.profiles?.full_name ?? "Quelqu'un"}
                </span>{" "}
                <span className="text-zinc-600">{m.contenu}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-zinc-400">Aucun message pour l&apos;instant.</p>
          )}
        </div>
      </div>
    </div>
  );
}
