"use strict";

const { isProfileComplete } = require("../src/lib/profile");

const complet = {
  role: "user",
  prenom: "Awa",
  age: 29,
  situation_familiale: "celibataire",
  revenus: "moyen",
  zone_geographique: "Lyon",
  statut: "salarie",
};

describe("isProfileComplete", () => {
  test("accepte un profil entièrement renseigné", () => {
    expect(isProfileComplete(complet)).toBe(true);
  });

  test("refuse un profil fraîchement inscrit (champs vides)", () => {
    const nouveau = { role: "user", prenom: null, age: null, situation_familiale: null, revenus: null, zone_geographique: null, statut: null };
    expect(isProfileComplete(nouveau)).toBe(false);
  });

  test("refuse un profil dont un champ manque ou est blanc", () => {
    expect(isProfileComplete({ ...complet, zone_geographique: "   " })).toBe(false);
    expect(isProfileComplete({ ...complet, statut: "" })).toBe(false);
  });

  test("accepte un âge égal à 0", () => {
    expect(isProfileComplete({ ...complet, age: 0 })).toBe(true);
  });

  test("dispense le compte administrateur", () => {
    expect(isProfileComplete({ role: "admin" })).toBe(true);
  });

  test("refuse un utilisateur absent", () => {
    expect(isProfileComplete(undefined)).toBe(false);
  });
});
