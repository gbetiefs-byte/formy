"use strict";

const express = require("express");
const { pool } = require("../db");
const { requireAuth, clearAuthCookies } = require("../middleware/auth");
const { isProfileComplete } = require("../lib/profile");

const router = express.Router();

const EDITABLE_FIELDS = ["prenom", "age", "situation_familiale", "revenus", "zone_geographique", "statut"];

router.put("/", requireAuth, async (req, res) => {
  const updates = [];
  const values = [];
  let i = 1;

  for (const field of EDITABLE_FIELDS) {
    if (field in (req.body || {})) {
      updates.push(`${field} = $${i++}`);
      values.push(req.body[field]);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "Aucun champ à mettre à jour." });
  }

  const age = req.body.age;
  if ("age" in req.body && age !== null && age !== "" && (!Number.isInteger(Number(age)) || Number(age) < 0 || Number(age) > 120)) {
    return res.status(400).json({ error: "L'âge doit être un nombre entier entre 0 et 120." });
  }

  values.push(req.user.id);
  const { rows } = await pool.query(
    `UPDATE users SET ${updates.join(", ")} WHERE id = $${i}
     RETURNING id, email, role, prenom, age, situation_familiale, revenus, zone_geographique, statut, created_at`,
    values
  );

  res.json({ ...rows[0], profile_complete: isProfileComplete(rows[0]) });
});

// Droit à la portabilité (RGPD) : export de toutes les données personnelles
// détenues sur l'utilisateur, au format JSON.
router.get("/export", requireAuth, async (req, res) => {
  const [user, progress, steps] = await Promise.all([
    pool.query(
      `SELECT id, email, role, prenom, age, situation_familiale, revenus, zone_geographique, statut, consent_at, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    ),
    pool.query(
      `SELECT up.statut, up.date_echeance, up.started_at, up.updated_at, d.slug AS demarche_slug, d.titre AS demarche_titre
       FROM user_progress up JOIN demarches d ON d.id = up.demarche_id WHERE up.user_id = $1`,
      [req.user.id]
    ),
    pool.query(
      `SELECT usp.done, usp.done_at, de.titre AS etape_titre, d.slug AS demarche_slug
       FROM user_step_progress usp
       JOIN demarche_etapes de ON de.id = usp.etape_id
       JOIN user_progress up ON up.id = usp.user_progress_id
       JOIN demarches d ON d.id = up.demarche_id
       WHERE up.user_id = $1`,
      [req.user.id]
    ),
  ]);

  res.setHeader("Content-Disposition", "attachment; filename=formy-export.json");
  res.json({
    export_genere_le: new Date().toISOString(),
    utilisateur: user.rows[0],
    demarches_suivies: progress.rows,
    etapes: steps.rows,
  });
});

// Droit à l'effacement (RGPD) : suppression définitive du compte et de
// toutes les données liées (cascade via les clés étrangères ON DELETE CASCADE).
router.delete("/", requireAuth, async (req, res) => {
  await pool.query("DELETE FROM users WHERE id = $1", [req.user.id]);
  clearAuthCookies(res);
  res.status(204).end();
});

module.exports = router;
