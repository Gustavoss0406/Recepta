import { describe, expect, it } from "vitest";
import { filtrarTags, tirarTags } from "./tags";

describe("Tags de áudio", () => {
  it("some do texto mostrado; na voz fica no máximo uma conhecida", () => {
    expect(tirarTags("[sighs] Poxa, sinto muito... [short pause] deixa eu ver.")).toBe("Poxa, sinto muito... deixa eu ver.");
    expect(filtrarTags("[sighs] Poxa! [laughs] Brincadeira.")).toBe("[sighs] Poxa! Brincadeira.");
    expect(filtrarTags("[Excited] Achei!")).toBe("[excited] Achei!");
    expect(filtrarTags("[barulho de porta] Oi")).toBe("Oi"); // unknown tags could be read aloud
    expect(tirarTags("Sem tags aqui.")).toBe("Sem tags aqui.");
  });
});
