"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refreshes the server page every few seconds while background work is running. */
export function AtualizarEnquanto({ ativo, ms = 5000 }: { ativo: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [ativo, ms, router]);
  return null;
}
