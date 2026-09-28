"use strict";

const { computeStatut } = require("../src/lib/progressStatus");

describe("computeStatut", () => {
  test("aucune étape cochée -> a_faire", () => {
    expect(computeStatut(5, 0)).toBe("a_faire");
  });

  test("toutes les étapes cochées -> termine", () => {
    expect(computeStatut(3, 3)).toBe("termine");
  });

  test("certaines étapes cochées -> en_cours", () => {
    expect(computeStatut(4, 2)).toBe("en_cours");
  });

  test("démarche sans étape définie -> en_cours par défaut", () => {
    expect(computeStatut(0, 0)).toBe("en_cours");
  });
});
