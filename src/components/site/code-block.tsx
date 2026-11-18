"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative min-w-0 rounded-[16px] border border-hairline bg-white p-5">
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute top-3 right-3 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-strong hover:text-ink"
        aria-label={copied ? "Copiado" : `Copiar ${label}`}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
      <pre className="overflow-x-auto font-mono text-[0.78rem] leading-relaxed text-body">
        <code>{code}</code>
      </pre>
    </div>
  );
}
