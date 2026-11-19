"use client";

import { useEffect } from "react";
import { ehVersaoAntiga, recarregarUmaVez } from "@/lib/versao-nova";

/** Any Server Action from a tab opened before the last deploy: reload once to get the new build. */
export function RecarregarSeVersaoAntiga() {
  useEffect(() => {
    const aoRejeitar = (e: PromiseRejectionEvent) => {
      if (ehVersaoAntiga(e.reason)) recarregarUmaVez();
    };
    const aoErro = (e: ErrorEvent) => {
      if (ehVersaoAntiga(e.error ?? e.message)) recarregarUmaVez();
    };
    window.addEventListener("unhandledrejection", aoRejeitar);
    window.addEventListener("error", aoErro);
    return () => {
      window.removeEventListener("unhandledrejection", aoRejeitar);
      window.removeEventListener("error", aoErro);
    };
  }, []);
  return null;
}
