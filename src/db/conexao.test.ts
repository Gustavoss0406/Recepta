import { describe, expect, it } from "vitest";
import { codificarSenha, opcoesConexao } from "./conexao";

describe("Conexão com o banco", () => {
  it("codifica senha com caracteres especiais e mantém as já codificadas", () => {
    const host = "@aws-0-us-east-2.pooler.supabase.com:5432/postgres";
    expect(codificarSenha(`postgresql://postgres.abc:Se#nha?1/@${host.slice(1)}`)).toBe(`postgresql://postgres.abc:Se%23nha%3F1%2F${host}`);
    expect(codificarSenha(`postgresql://postgres.abc:Se%23nha${host}`)).toBe(`postgresql://postgres.abc:Se%23nha${host}`);
    expect(() => new URL(codificarSenha(`postgresql://u:a#b@h:5432/db`))).not.toThrow();
  });

  it("usa TLS sem sslmode na URL para hosts gerenciados", () => {
    const o = opcoesConexao("postgresql://u:p#1@aws-0-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require");
    expect(o.connectionString).toBe("postgresql://u:p%231@aws-0-us-east-2.pooler.supabase.com:5432/postgres");
    expect(o.ssl).toEqual({ rejectUnauthorized: false });
  });
});
