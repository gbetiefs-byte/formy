"use strict";

const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get("/stats", async (req, res) => {
  const [users, demarches, progress, byStatut] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count FROM users"),
    pool.query("SELECT COUNT(*)::int AS count FROM demarches"),
    pool.query("SELECT COUNT(*)::int AS count FROM user_progress"),
    pool.query("SELECT statut, COUNT(*)::int AS count FROM user_progress GROUP BY statut"),
  ]);

  res.json({
    totalUsers: users.rows[0].count,
    totalDemarches: demarches.rows[0].count,
    totalProgressEntries: progress.rows[0].count,
    progressByStatut: byStatut.rows,
  });
});

module.exports = router;
