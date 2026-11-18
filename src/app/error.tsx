"use client";

import { useEffect, useState } from "react";
import { ehVersaoAntiga, recarregarUmaVez } from "@/lib/versao-nova";

export default function Erro({ error, retry }: { error: unknown; retry: () => void }) {
  const [recarregando, setRecarregando] = useState(false);
  useEffect(() => {
    if (ehVersaoAntiga(error) && recarregarUmaVez()) setRecarregando(true);
    else console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-[60dvh] place-items-center px-4">
      <div className="max-w-sm text-center">
        <h2 className="text-[1.0625rem] font-medium text-foreground">{recarregando ? "Atualizando para a versão mais nova…" : "Algo deu errado"}</h2>
        {!recarregando && (
          <>
            <p className="mt-1 text-sm text-muted-foreground">Tente de novo. Se continuar, recarregue a página.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" onClick={() => retry()} className="h-9 rounded-full bg-foreground px-4 text-sm font-medium text-white">
                Tentar de novo
              </button>
              <button type="button" onClick={() => window.location.reload()} className="h-9 rounded-full border border-border px-4 text-sm">
                Recarregar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
