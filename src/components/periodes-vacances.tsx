"use client";

import type { PeriodeVacances } from "@/lib/vacances";

function formatPeriode(p: PeriodeVacances) {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const debut = new Date(`${p.debut}T00:00:00`).toLocaleDateString(
    "fr-FR",
    opts
  );
  const fin = new Date(`${p.fin}T00:00:00`).toLocaleDateString("fr-FR", opts);
  return `${debut} – ${fin}`;
}

export function PeriodesVacances({
  periodes,
  zone,
  loading,
}: {
  periodes: PeriodeVacances[];
  zone: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
        Vacances scolaires · Zone {zone} · centre ouvert uniquement à ces
        dates
      </p>
      {loading ? (
        <p className="mt-2 text-sm text-zinc-400">Chargement...</p>
      ) : periodes.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-400">
          Aucune période à venir trouvée.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {periodes.map((p) => (
            <span
              key={p.description + p.debut}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700"
            >
              {p.description.replace("Vacances de ", "").replace("Vacances d'", "")}{" "}
              <span className="text-zinc-400">· {formatPeriode(p)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
