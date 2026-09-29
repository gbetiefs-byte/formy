"use strict";

// Champs à renseigner lors de l'inscription pour accéder à l'application.
const REQUIRED_PROFILE_FIELDS = ["prenom", "age", "situation_familiale", "revenus", "zone_geographique", "statut"];

// Un profil est "complet" quand tous les champs de personnalisation sont
// remplis. Le compte administrateur (créé par l'initialisation, sans
// inscription) est dispensé de cette étape.
function isProfileComplete(user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return REQUIRED_PROFILE_FIELDS.every((field) => {
    const value = user[field];
    return value !== null && value !== undefined && String(value).trim() !== "";
  });
}

module.exports = { REQUIRED_PROFILE_FIELDS, isProfileComplete };
