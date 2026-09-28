"use strict";

// Personnalisation v1 : moteur a base de regles (pas de ML). Associe le
// statut declare par l'utilisateur a des categories prioritaires, et exclut
// quelques demarches manifestement hors-cible selon l'age. Fonction pure,
// testee unitairement. Une v2 pourra remplacer ceci par un vrai scoring
// (poids par evenement de vie recent, historique, etc.) sans changer l'API.

const STATUT_CATEGORY_WEIGHTS = {
  etudiant: ["etudes-superieures", "aides-sociales-solidarite", "logement"],
  independant: ["creation-entreprise", "fiscalite"],
  salarie: ["emploi-carriere", "entree-vie-active"],
  demandeur_emploi: ["emploi-carriere", "aides-sociales-solidarite"],
  retraite: ["retraite-vieillissement", "sante-handicap"],
};

const MINEUR_ONLY_CATEGORY = "enfance-scolarite-jeunesse";

function scoreDemarche(demarche, user) {
  let score = 0;

  const weights = STATUT_CATEGORY_WEIGHTS[user.statut] || [];
  const rank = weights.indexOf(demarche.category_slug);
  if (rank !== -1) score += weights.length - rank;

  if (user.age != null) {
    const isAboutMinor = demarche.category_slug === MINEUR_ONLY_CATEGORY;
    if (isAboutMinor && user.age >= 18 && !/enfant|scolaire|permis/i.test(demarche.titre)) {
      score -= 5;
    }
    if (demarche.slug === "premiere-carte-vitale" && user.age < 16) score -= 10;
    if (demarche.slug === "demande-retraite" && user.age < 55) score -= 10;
    if (demarche.slug === "aspa" && user.age < 60) score -= 10;
  }

  return score;
}

function recommend(demarches, user, limit = 8) {
  return [...demarches]
    .map((d) => ({ demarche: d, score: scoreDemarche(d, user) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.demarche);
}

module.exports = { recommend, scoreDemarche };
