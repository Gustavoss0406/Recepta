import { describe, expect, it } from "vitest";
import { filtrarTags, tirarTags } from "./tags";

describe("Tags de áudio", () => {
  it("some do texto mostrado; na voz ficam no máximo duas conhecidas", () => {
    expect(tirarTags("[sighs] Poxa, sinto muito... [short pause] deixa eu ver.")).toBe("Poxa, sinto muito... deixa eu ver.");
    expect(filtrarTags("[sighs] Poxa! [laughs] Brincadeira.")).toBe("[sighs] Poxa! [laughs] Brincadeira.");
    expect(filtrarTags("[sighs] Poxa! [laughs softly] Brincadeira. [excited] Achei!")).toBe("[sighs] Poxa! [laughs softly] Brincadeira. Achei!");
    expect(filtrarTags("[Excited] Achei!")).toBe("[excited] Achei!");
    expect(filtrarTags("[barulho de porta] Oi")).toBe("Oi"); // unknown tags could be read aloud
    expect(tirarTags("Sem tags aqui.")).toBe("Sem tags aqui.");
  });
});
