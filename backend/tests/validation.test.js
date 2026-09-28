"use strict";

const { isValidEmail, isValidPassword } = require("../src/lib/validation");

describe("isValidEmail", () => {
  test.each([
    ["test@example.com", true],
    ["prenom.nom@sous.domaine.fr", true],
    ["pas-un-email", false],
    ["manque@domaine", false],
    ["", false],
    [undefined, false],
  ])("%s -> %s", (input, expected) => {
    expect(isValidEmail(input)).toBe(expected);
  });
});

describe("isValidPassword", () => {
  test.each([
    ["Passw0rd", true],
    ["motdepasse1", true],
    ["short1", false], // trop court
    ["motdepassesanschiffre", false], // pas de chiffre
    ["12345678", false], // pas de lettre
    ["", false],
  ])("%s -> %s", (input, expected) => {
    expect(isValidPassword(input)).toBe(expected);
  });
});
