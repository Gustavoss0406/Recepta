import type { Metadata, Viewport } from "next";
import "./globals.css";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: { default: `${brand.name} · A recepcionista que atende toda ligação`, template: `%s · ${brand.name}` },
  description:
    "Uma recepcionista virtual que atende toda ligação, agenda e tira dúvidas 24 horas por dia e, na dúvida, passa o caso pronto para sua equipe. Tudo incluso, em reais.",
};

export const viewport: Viewport = { themeColor: "#f5f5f5" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
