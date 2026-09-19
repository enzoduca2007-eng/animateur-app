"use client";

import type { FeuilleTemps } from "@/lib/types";

export function PointageJour({
  feuille,
  onChange,
  readOnly = false,
}: {
  feuille: FeuilleTemps | null;
  onChange: (
    updates: Partial<
      Pick<
        FeuilleTemps,
        "present" | "motif_absence" | "heure_arrivee_reelle" | "heure_depart_reelle"
      >
    >
  ) => void;
  readOnly?: boolean;
}) {
  const present = feuille?.present ?? true;

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Pointage
        </p>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={present}
            disabled={readOnly}
            onChange={(e) => onChange({ present: e.target.checked })}
          />
          Présent(e)
        </label>
      </div>

      {present ? (
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-zinc-500">Arrivée réelle</label>
            <input
              type="time"
              defaultValue={feuille?.heure_arrivee_reelle?.slice(0, 5) ?? ""}
              disabled={readOnly}
              onBlur={(e) =>
                onChange({ heure_arrivee_reelle: e.target.value || null })
              }
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-100"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500">Départ réel</label>
            <input
              type="time"
              defaultValue={feuille?.heure_depart_reelle?.slice(0, 5) ?? ""}
              disabled={readOnly}
              onBlur={(e) =>
                onChange({ heure_depart_reelle: e.target.value || null })
              }
              className="rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-100"
            />
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <label className="block text-xs text-zinc-500">
            Motif de l&apos;absence
          </label>
          <input
            type="text"
            defaultValue={feuille?.motif_absence ?? ""}
            disabled={readOnly}
            onBlur={(e) => onChange({ motif_absence: e.target.value || null })}
            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-100"
          />
        </div>
      )}
    </div>
  );
}
