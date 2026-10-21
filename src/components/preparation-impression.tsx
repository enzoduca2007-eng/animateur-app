"use client";

import { useEffect } from "react";
import { preparerImpression } from "@/lib/impression";

// Écoute "beforeprint" pour toutes les impressions, y compris Ctrl+P ou le
// menu du navigateur, pas seulement les boutons de l'app.
export function PreparationImpression() {
  useEffect(() => {
    window.addEventListener("beforeprint", preparerImpression);
    return () => window.removeEventListener("beforeprint", preparerImpression);
  }, []);
  return null;
}
