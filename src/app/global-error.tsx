"use client";

import { useEffect } from "react";
import { ehVersaoAntiga, recarregarUmaVez } from "@/lib/versao-nova";

/** Last-resort boundary (errors in the root layout). Plain markup: the app's styles may not be loaded. */
export default function ErroGlobal({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    if (!(ehVersaoAntiga(error) && recarregarUmaVez())) console.error(error);
  }, [error]);
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <div style={{ textAlign: "center" }}>
          <p>Algo deu errado.</p>
          <button type="button" onClick={() => retry()} style={{ marginRight: 8 }}>
            Tentar de novo
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            Recarregar
          </button>
        </div>
      </body>
    </html>
  );
}
