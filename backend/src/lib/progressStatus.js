"use strict";

// Calcule le statut d'une demarche suivie a partir du nombre d'etapes
// cochees. Fonction pure, testee unitairement.
function computeStatut(totalEtapes, etapesCompletees) {
  if (totalEtapes <= 0) return "en_cours";
  if (etapesCompletees === 0) return "a_faire";
  if (etapesCompletees >= totalEtapes) return "termine";
  return "en_cours";
}

module.exports = { computeStatut };
