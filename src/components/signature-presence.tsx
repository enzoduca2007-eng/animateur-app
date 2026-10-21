"use client";

import { useEffect, useRef, useState } from "react";
import type { SignaturePresence } from "@/lib/types";

// Résolution interne fixe du dessin (indépendante de l'écran) : garde la
// signature légère en base et nette à l'impression.
const LARGEUR = 600;
const HAUTEUR = 200;

export function aujourdhuiISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function formatHeureSignature(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function PadSignature({
  onValider,
  onAnnuler,
  enCours,
}: {
  onValider: (dataUrl: string) => void;
  onAnnuler?: () => void;
  enCours: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dessine = useRef(false);
  const dernierPoint = useRef<{ x: number; y: number } | null>(null);
  const [vide, setVide] = useState(true);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b1f4d";
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * LARGEUR,
      y: ((e.clientY - rect.top) / rect.height) * HAUTEUR,
    };
  }

  function debut(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dessine.current = true;
    const p = point(e);
    dernierPoint.current = p;
    const ctx = e.currentTarget.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    setVide(false);
  }

  function deplacement(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dessine.current || !dernierPoint.current) return;
    e.preventDefault();
    const p = point(e);
    const ctx = e.currentTarget.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(dernierPoint.current.x, dernierPoint.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    dernierPoint.current = p;
  }

  function fin() {
    dessine.current = false;
    dernierPoint.current = null;
  }

  function effacer() {
    canvasRef.current?.getContext("2d")?.clearRect(0, 0, LARGEUR, HAUTEUR);
    setVide(true);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={LARGEUR}
        height={HAUTEUR}
        onPointerDown={debut}
        onPointerMove={deplacement}
        onPointerUp={fin}
        onPointerCancel={fin}
        onPointerLeave={fin}
        // touch-action: none empêche la page de défiler pendant qu'on signe.
        className="block aspect-[3/1] w-full touch-none rounded-md border-2 border-dashed border-zinc-300 bg-white"
      />
      <p className="mt-1 text-[11px] text-zinc-400">Signez avec le doigt dans le cadre.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={vide || enCours}
          onClick={() => onValider(canvasRef.current!.toDataURL("image/png"))}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          {enCours ? "Enregistrement..." : "✍️ Valider ma signature"}
        </button>
        <button
          type="button"
          disabled={vide || enCours}
          onClick={effacer}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
        >
          Effacer
        </button>
        {onAnnuler && (
          <button
            type="button"
            disabled={enCours}
            onClick={onAnnuler}
            className="px-2 py-1.5 text-sm text-zinc-500 hover:text-zinc-800"
          >
            Annuler
          </button>
        )}
      </div>
    </div>
  );
}

/** Bloc "Signature de présence" d'un jour dans Mon planning. La signature
 * se fait uniquement en scannant le QR code du jour affiché à la MJC
 * (page /dashboard/presence) : ici, on affiche juste l'état. */
export function SignaturePresenceJour({
  date,
  signature,
}: {
  date: string;
  signature: SignaturePresence | null;
}) {
  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Signature de présence
      </p>

      {signature ? (
        <div className="mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signature.signature}
            alt="Signature"
            className="h-16 w-auto rounded-md border border-zinc-200 bg-white"
          />
          <p className="mt-1 text-xs text-emerald-700">
            ✓ Signé à {formatHeureSignature(signature.signe_le)}
          </p>
        </div>
      ) : date > aujourdhuiISO() ? (
        <p className="mt-1 text-sm text-zinc-400">Tu pourras signer ce jour-là.</p>
      ) : (
        <p className="mt-1 text-sm text-zinc-700">
          📷 Pas encore signé : scanne le QR code de ce jour sur la feuille affichée à la MJC.
        </p>
      )}
    </div>
  );
}
