"use client";

import { useEffect, useState } from "react";
import type { PeriodeVacances } from "@/lib/vacances";

export function useVacances() {
  const [periodes, setPeriodes] = useState<PeriodeVacances[]>([]);
  const [zone, setZone] = useState<string>("A");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/vacances")
      .then((res) => res.json())
      .then((data: { zone: string; periodes: PeriodeVacances[] }) => {
        if (cancelled) return;
        setPeriodes(data.periodes ?? []);
        setZone(data.zone ?? "A");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { periodes, zone, loading };
}
