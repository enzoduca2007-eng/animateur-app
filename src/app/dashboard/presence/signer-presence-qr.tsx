"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { PadSignature } from "@/components/signature-presence";
import type { SignaturePresence } from "@/lib/types";

function formatJourLong(dateISO: string) {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function SignerPresenceQr({ jeton }: { jeton: string }) {
  const profile = useProfile();
  const supabase = createClient();
  // undefined : chargement ; null : QR code invalide.
  const [date, setDate] = useState<string | null | undefined>(undefined);
  const [existante, setExistante] = useState<SignaturePresence | null>(null);
  const [modification, setModification] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!jeton) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDate(null);
      return;
    }
    (async () => {
      const { data } = await supabase.rpc("qr_presence_date", { p_jeton: jeton });
      const d = (data as string | null) ?? null;
      setDate(d);
      if (!d) return;
      const { data: anim } = await supabase
        .from("animateurs")
        .select("id")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (!anim) return;
      const { data: sig } = await supabase
        .from("signatures_presence")
        .select("*")
        .eq("animateur_id", anim.id)
        .eq("date", d)
        .maybeSingle();
      setExistante((sig as SignaturePresence) ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jeton]);

  async function signer(dataUrl: string) {
    setEnCours(true);
    setErreur(null);
    const { data, error } = await supabase.rpc("signer_presence_qr", {
      p_jeton: jeton,
      p_signature: dataUrl,
    });
    setEnCours(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setExistante(data as SignaturePresence);
    setModification(false);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Signature de présence</h1>

      {date === undefined ? (
        <p className="text-sm text-zinc-400">Chargement...</p>
      ) : date === null ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          QR code invalide. Scanne le QR code de la feuille affichée à la MJC.
        </p>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-lg font-bold capitalize text-zinc-900">{formatJourLong(date)}</p>
          <p className="text-sm text-zinc-500">
            {profile.full_name ?? profile.email}
          </p>

          {erreur && (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {erreur}
            </p>
          )}

          {existante && !modification ? (
            <div className="mt-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={existante.signature}
                alt="Signature"
                className="h-20 w-auto rounded-md border border-zinc-200 bg-white"
              />
              <p className="mt-2 text-sm font-medium text-emerald-700">
                ✓ Présence signée à{" "}
                {new Date(existante.signe_le).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  href="/dashboard/mon-planning"
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
                >
                  Voir mon planning
                </Link>
                <button
                  type="button"
                  onClick={() => setModification(true)}
                  className="text-sm text-zinc-500 underline hover:text-zinc-800"
                >
                  Refaire ma signature
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <PadSignature
                onValider={signer}
                onAnnuler={existante ? () => setModification(false) : undefined}
                enCours={enCours}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
