"use client";

import { useFormStatus } from "react-dom";

export function Campo({
  label,
  name,
  type = "text",
  defaultValue,
  autoComplete,
  placeholder,
  required = true,
  hint,
  minLength,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm text-ink">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        className="field mt-1.5"
      />
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function BotaoEnviar({ children, className = "btn btn-primary w-full" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-60`} aria-busy={pending}>
      {pending ? "Aguarde…" : children}
    </button>
  );
}

export function Erro({ mensagem }: { mensagem?: string }) {
  if (!mensagem) return null;
  return (
    <p role="alert" className="rounded-[10px] bg-[#fdecec] px-3 py-2.5 text-sm text-error">
      {mensagem}
    </p>
  );
}
