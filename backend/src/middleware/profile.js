"use strict";

const { pool } = require("../db");
const { requireAuth, optionalAuth } = require("./auth");
const { isProfileComplete } = require("../lib/profile");

async function loadUser(id) {
  const { rows } = await pool.query(
    "SELECT id, role, prenom, age, situation_familiale, revenus, zone_geographique, statut FROM users WHERE id = $1",
    [id]
  );
  return rows[0];
}

// Protège les ressources de l'application (API) : il faut être inscrit ET
// avoir personnalisé son profil.
function requireCompleteProfile(req, res, next) {
  requireAuth(req, res, async () => {
    try {
      const user = await loadUser(req.user.id);
      if (!user) return res.status(401).json({ error: "Session invalide ou expirée." });
      if (!isProfileComplete(user)) {
        return res
          .status(403)
          .json({ error: "Complétez votre profil pour accéder à cette ressource.", code: "PROFILE_INCOMPLETE" });
      }
      next();
    } catch (err) {
      next(err);
    }
  });
}

// Protège les pages rendues côté serveur : si la personne n'est pas connectée
// ou n'a pas complété son profil, on passe à la route suivante (coquille SPA
// vide), et le routeur client la redirige vers l'inscription ou le profil.
function ssrGate(req, res, next) {
  optionalAuth(req, res, async () => {
    if (!req.user) return next("route");
    try {
      const user = await loadUser(req.user.id);
      if (!isProfileComplete(user)) return next("route");
      next();
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { requireCompleteProfile, ssrGate };
