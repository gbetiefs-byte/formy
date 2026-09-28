"use strict";

const { recommend } = require("../src/lib/recommendation");

const demarches = [
  { slug: "creation-micro-entreprise", titre: "Création de micro-entreprise", category_slug: "creation-entreprise" },
  { slug: "inscription-france-travail", titre: "Inscription à France Travail", category_slug: "emploi-carriere" },
  { slug: "parcoursup", titre: "Parcoursup", category_slug: "etudes-superieures" },
  { slug: "opposition-carte-bancaire", titre: "Opposition sur carte bancaire", category_slug: "consommation-litiges" },
];

describe("recommend", () => {
  test("priorise les catégories liées au statut de l'utilisateur", () => {
    const result = recommend(demarches, { statut: "independant", age: 30 }, 4);
    expect(result[0].slug).toBe("creation-micro-entreprise");
  });

  test("statut étudiant priorise les études supérieures", () => {
    const result = recommend(demarches, { statut: "etudiant", age: 19 }, 4);
    expect(result[0].slug).toBe("parcoursup");
  });

  test("respecte la limite demandée", () => {
    const result = recommend(demarches, { statut: "salarie", age: 40 }, 2);
    expect(result).toHaveLength(2);
  });
});
