"use strict";

const glossary = require("../src/seed/glossary");

describe("glossaire", () => {
  test("aucun terme en double", () => {
    const termes = glossary.map((g) => g.terme);
    expect(new Set(termes).size).toBe(termes.length);
  });

  test("chaque terme a une définition non vide", () => {
    for (const entry of glossary) {
      expect(entry.definition.length).toBeGreaterThan(10);
    }
  });
});
