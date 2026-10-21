"use client";

import { useState } from "react";
import type { SignatureSemaine } from "@/lib/types";
import { PadSignature, aujourdhuiISO } from "@/components/signature-presence";

export type LigneRecap = {
  date: string;
  /** Ex. "7h30 → 18h00 (8h)". */
  prevu: string;
  /** Ex. "7h45 → 18h00", "Absent (malade)" ou "" si pas encore pointé. */
  reel: string;
  present: boolean | null;
  signe: boolean;
};

function formatJour(dateISO: string) {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Récapitulatif de la semaine dans Mon planning : 1. les horaires (prévu /
 * réel), 2. les présences signées jour par jour, puis la signature de la
 * fiche de la semaine — bloquée tant qu'un jour pointé présent n'est pas
 * signé ou que la semaine n'est pas terminée. */
export function RecapSemaine({
  lignes,
  signatureSemaine,
  onAllerAuJour,
  onSignerSemaine,
}: {
  lignes: LigneRecap[];
  signatureSemaine: SignatureSemaine | null;
  onAllerAuJour: (date: string) => void;
  onSignerSemaine: (dataUrl: string) => Promise<void>;
}) {
  const [modification, setModification] = useState(false);
  const [enCours, setEnCours] = useState(false);

  if (lignes.length === 0) return null;
  const premier = lignes[0].date;
  const dernier = lignes[lignes.length - 1].date;
  const manquants = lignes.filter((l) => l.present === true && !l.signe);
  const semaineFinie = dernier <= aujourdhuiISO();

  async function valider(dataUrl: string) {
    setEnCours(true);
    await onSignerSemaine(dataUrl);
    setEnCours(false);
    setModification(false);
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-base font-bold text-zinc-900">Récapitulatif de la semaine</p>
      <p className="text-xs text-zinc-500">
        Du {formatJour(premier)} au {formatJour(dernier)}
      </p>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        1. Horaires
      </p>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="text-zinc-500">
              <th className="border-b border-zinc-200 py-1 pr-2 font-medium">Jour</th>
              <th className="border-b border-zinc-200 py-1 pr-2 font-medium">Prévu</th>
              <th className="border-b border-zinc-200 py-1 font-medium">Réel</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.date}>
                <td className="whitespace-nowrap border-b border-zinc-100 py-1.5 pr-2 capitalize text-zinc-700">
                  {formatJour(l.date)}
                </td>
                <td className="border-b border-zinc-100 py-1.5 pr-2 text-zinc-700">{l.prevu}</td>
                <td className="border-b border-zinc-100 py-1.5 text-zinc-700">
                  {l.reel || <span className="text-zinc-400">Pas encore pointé</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        2. Présences
      </p>
      <ul className="mt-1 flex flex-col gap-1">
        {lignes.map((l) => {
          const aSigner = l.date <= aujourdhuiISO();
          return (
            <li key={l.date} className="flex items-center justify-between gap-2 text-sm">
              <span className="capitalize text-zinc-700">{formatJour(l.date)}</span>
              {l.signe ? (
                <span className="text-xs font-medium text-emerald-700">✓ Signé</span>
              ) : l.present === false ? (
                <span className="text-xs text-zinc-400">Absent</span>
              ) : aSigner ? (
                <button
                  type="button"
                  onClick={() => onAllerAuJour(l.date)}
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                    l.present
                      ? "bg-red-50 text-red-700 hover:bg-red-100"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                  }`}
                >
                  📷 À scanner
                </button>
              ) : (
                <span className="text-xs text-zinc-400">À venir</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 border-t border-zinc-200 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Signature de ma fiche de la semaine
        </p>
        {signatureSemaine && !modification ? (
          <div className="mt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signatureSemaine.signature}
              alt="Signature de la semaine"
              className="h-16 w-auto rounded-md border border-zinc-200 bg-white"
            />
            <p className="mt-1 text-xs text-emerald-700">
              ✓ Fiche signée le{" "}
              {new Date(signatureSemaine.signe_le).toLocaleString("fr-FR", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {manquants.length === 0 && (
              <button
                type="button"
                onClick={() => setModification(true)}
                className="mt-1 text-xs text-zinc-500 underline hover:text-zinc-800"
              >
                Refaire ma signature
              </button>
            )}
          </div>
        ) : manquants.length > 0 ? (
          <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            🔒 Signe d&apos;abord ta présence pour :{" "}
            {manquants.map((l) => formatJour(l.date)).join(", ")}.
          </p>
        ) : !semaineFinie ? (
          <p className="mt-2 text-sm text-zinc-400">
            Tu pourras signer ta fiche en fin de semaine (à partir du {formatJour(dernier)}).
          </p>
        ) : (
          <div className="mt-2">
            <PadSignature
              onValider={valider}
              onAnnuler={signatureSemaine ? () => setModification(false) : undefined}
              enCours={enCours}
            />
          </div>
        )}
      </div>
    </div>
  );
}
