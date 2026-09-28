"use strict";

const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { computeStatut } = require("../lib/progressStatus");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT up.*, d.slug AS demarche_slug, d.titre AS demarche_titre, c.slug AS category_slug,
       (SELECT COUNT(*)::int FROM demarche_etapes WHERE demarche_id = d.id) AS total_etapes,
       (SELECT COUNT(*)::int FROM user_step_progress usp
          JOIN demarche_etapes de ON de.id = usp.etape_id
          WHERE usp.user_progress_id = up.id AND usp.done = true AND de.demarche_id = d.id) AS etapes_completees
     FROM user_progress up
     JOIN demarches d ON d.id = up.demarche_id
     JOIN categories c ON c.id = d.category_id
     WHERE up.user_id = $1
     ORDER BY (up.date_echeance IS NULL), up.date_echeance ASC, up.updated_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

router.post("/:demarcheSlug", async (req, res) => {
  const demarche = await pool.query("SELECT id FROM demarches WHERE slug = $1", [req.params.demarcheSlug]);
  if (!demarche.rows[0]) return res.status(404).json({ error: "Démarche introuvable." });

  const { rows } = await pool.query(
    `INSERT INTO user_progress (user_id, demarche_id, statut)
     VALUES ($1, $2, 'en_cours')
     ON CONFLICT (user_id, demarche_id) DO UPDATE SET updated_at = now()
     RETURNING *`,
    [req.user.id, demarche.rows[0].id]
  );
  res.status(201).json(rows[0]);
});

router.put("/:demarcheSlug", async (req, res) => {
  const { statut, date_echeance } = req.body || {};

  const demarche = await pool.query("SELECT id FROM demarches WHERE slug = $1", [req.params.demarcheSlug]);
  if (!demarche.rows[0]) return res.status(404).json({ error: "Démarche introuvable." });

  const updates = ["updated_at = now()"];
  const values = [];
  let i = 1;

  if (statut !== undefined) {
    if (!["a_faire", "en_cours", "termine"].includes(statut)) {
      return res.status(400).json({ error: "Statut invalide." });
    }
    updates.push(`statut = $${i++}`);
    values.push(statut);
  }
  if (date_echeance !== undefined) {
    updates.push(`date_echeance = $${i++}`);
    values.push(date_echeance || null);
  }

  values.push(req.user.id, demarche.rows[0].id);
  const { rows } = await pool.query(
    `UPDATE user_progress SET ${updates.join(", ")}
     WHERE user_id = $${i++} AND demarche_id = $${i} RETURNING *`,
    values
  );
  if (!rows[0]) return res.status(404).json({ error: "Suivi non démarré pour cette démarche." });
  res.json(rows[0]);
});

router.delete("/:demarcheSlug", async (req, res) => {
  const demarche = await pool.query("SELECT id FROM demarches WHERE slug = $1", [req.params.demarcheSlug]);
  if (!demarche.rows[0]) return res.status(404).json({ error: "Démarche introuvable." });

  await pool.query("DELETE FROM user_progress WHERE user_id = $1 AND demarche_id = $2", [req.user.id, demarche.rows[0].id]);
  res.status(204).end();
});

router.put("/:demarcheSlug/etapes/:etapeId", async (req, res) => {
  const { done } = req.body || {};
  const demarche = await pool.query("SELECT id FROM demarches WHERE slug = $1", [req.params.demarcheSlug]);
  if (!demarche.rows[0]) return res.status(404).json({ error: "Démarche introuvable." });

  const progress = await pool.query(
    `INSERT INTO user_progress (user_id, demarche_id, statut)
     VALUES ($1, $2, 'en_cours')
     ON CONFLICT (user_id, demarche_id) DO UPDATE SET updated_at = now()
     RETURNING *`,
    [req.user.id, demarche.rows[0].id]
  );

  const { rows } = await pool.query(
    `INSERT INTO user_step_progress (user_progress_id, etape_id, done, done_at)
     VALUES ($1, $2, $3, CASE WHEN $3 THEN now() ELSE NULL END)
     ON CONFLICT (user_progress_id, etape_id)
     DO UPDATE SET done = $3, done_at = CASE WHEN $3 THEN now() ELSE NULL END
     RETURNING *`,
    [progress.rows[0].id, req.params.etapeId, !!done]
  );

  const total = await pool.query(
    "SELECT COUNT(*)::int AS total FROM demarche_etapes WHERE demarche_id = $1",
    [demarche.rows[0].id]
  );
  const completed = await pool.query(
    `SELECT COUNT(*)::int AS completed FROM user_step_progress usp
     JOIN demarche_etapes de ON de.id = usp.etape_id
     WHERE usp.user_progress_id = $1 AND usp.done = true AND de.demarche_id = $2`,
    [progress.rows[0].id, demarche.rows[0].id]
  );

  const statut = computeStatut(total.rows[0].total, completed.rows[0].completed);
  await pool.query("UPDATE user_progress SET statut = $1, updated_at = now() WHERE id = $2", [statut, progress.rows[0].id]);

  res.json({ etape: rows[0], statut });
});

module.exports = router;
