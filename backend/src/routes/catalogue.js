"use strict";

const express = require("express");
const { pool } = require("../db");
const { requireAuth, optionalAuth } = require("../middleware/auth");
const { recommend } = require("../lib/recommendation");

const router = express.Router();

router.get("/categories", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM categories ORDER BY nom");
  res.json(rows);
});

router.get("/life-events", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM life_events ORDER BY nom");
  res.json(rows);
});

// Lexique des sigles/termes administratifs, utilisé côté frontend pour
// afficher une définition en infobulle partout où le terme apparaît.
router.get("/glossaire", async (req, res) => {
  const { rows } = await pool.query("SELECT terme, definition FROM glossaire ORDER BY length(terme) DESC");
  res.json(rows);
});

router.get("/life-events/:slug/demarches", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.*, c.slug AS category_slug FROM demarches d
     JOIN categories c ON c.id = d.category_id
     JOIN demarche_life_events dle ON dle.demarche_id = d.id
     JOIN life_events le ON le.id = dle.life_event_id
     WHERE le.slug = $1
     ORDER BY d.titre`,
    [req.params.slug]
  );
  res.json(rows);
});

router.get("/demarches", async (req, res) => {
  const { search, category, event } = req.query;
  const conditions = [];
  const values = [];
  let i = 1;

  // EXISTS plutôt qu'un JOIN sur demarche_life_events (relation N-N) : évite
  // les doublons qu'un DISTINCT devrait ensuite filtrer — DISTINCT est
  // d'ailleurs incompatible avec un ORDER BY sur une expression calculée
  // (similarité) qui n'apparaît pas dans la liste SELECT.
  let query = "SELECT d.*, c.slug AS category_slug FROM demarches d JOIN categories c ON c.id = d.category_id";
  if (category) {
    conditions.push(`c.slug = $${i++}`);
    values.push(category);
  }
  if (event) {
    conditions.push(
      `EXISTS (SELECT 1 FROM demarche_life_events dle JOIN life_events le ON le.id = dle.life_event_id WHERE dle.demarche_id = d.id AND le.slug = $${i++})`
    );
    values.push(event);
  }

  let orderBy = "d.titre";
  if (search) {
    // pg_trgm : tolère les fautes de frappe et classe par pertinence,
    // plutôt qu'un simple ILIKE qui ne trie pas et rate les quasi-correspondances.
    conditions.push(`(d.titre % $${i} OR d.description % $${i} OR d.titre ILIKE $${i + 1} OR d.description ILIKE $${i + 1})`);
    values.push(search, `%${search}%`);
    orderBy = `GREATEST(similarity(d.titre, $${i}), similarity(d.description, $${i})) DESC, d.titre`;
    i += 2;
  }

  if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
  query += ` ORDER BY ${orderBy}`;

  const client = await pool.connect();
  try {
    if (search) {
      // Seuil par défaut (0.3) trop strict pour les mots courts (ex :
      // "naissanse" vs "naissance") ; assoupli pour cette requête uniquement
      // via SET LOCAL, sans affecter les autres connexions du pool.
      await client.query("BEGIN");
      await client.query("SET LOCAL pg_trgm.similarity_threshold = 0.2");
      const { rows } = await client.query(query, values);
      await client.query("COMMIT");
      return res.json(rows);
    }
    const { rows } = await client.query(query, values);
    res.json(rows);
  } catch (err) {
    if (search) await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// Recommandations personnalisées : demarches non encore suivies,
// classées selon le profil déclaré (statut, âge). Cf. lib/recommendation.js.
router.get("/demarches/recommandees", requireAuth, async (req, res) => {
  const [user, allDemarches, alreadyTracked] = await Promise.all([
    pool.query("SELECT statut, age FROM users WHERE id = $1", [req.user.id]),
    pool.query(
      `SELECT d.*, c.slug AS category_slug FROM demarches d JOIN categories c ON c.id = d.category_id`
    ),
    pool.query("SELECT demarche_id FROM user_progress WHERE user_id = $1", [req.user.id]),
  ]);

  const trackedIds = new Set(alreadyTracked.rows.map((r) => r.demarche_id));
  const candidates = allDemarches.rows.filter((d) => !trackedIds.has(d.id));

  res.json(recommend(candidates, user.rows[0] || {}, 8));
});

router.get("/demarches/:slug", optionalAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.*, c.slug AS category_slug, c.nom AS category_nom, c.icone AS category_icone
     FROM demarches d JOIN categories c ON c.id = d.category_id
     WHERE d.slug = $1`,
    [req.params.slug]
  );
  const demarche = rows[0];
  if (!demarche) return res.status(404).json({ error: "Démarche introuvable." });

  // Si l'utilisateur est connecté, on renvoie l'état coché/non coché de
  // chaque étape (sinon les cases se "réinitialisaient" visuellement à
  // chaque nouvelle visite, alors que la progression était bien enregistrée).
  const etapes = req.user
    ? await pool.query(
        `SELECT de.id, de.ordre, de.titre, de.description, COALESCE(usp.done, false) AS done
         FROM demarche_etapes de
         LEFT JOIN user_progress up ON up.demarche_id = de.demarche_id AND up.user_id = $2
         LEFT JOIN user_step_progress usp ON usp.etape_id = de.id AND usp.user_progress_id = up.id
         WHERE de.demarche_id = $1 ORDER BY de.ordre`,
        [demarche.id, req.user.id]
      )
    : await pool.query(
        "SELECT id, ordre, titre, description FROM demarche_etapes WHERE demarche_id = $1 ORDER BY ordre",
        [demarche.id]
      );
  const events = await pool.query(
    `SELECT le.slug, le.nom FROM life_events le
     JOIN demarche_life_events dle ON dle.life_event_id = le.id
     WHERE dle.demarche_id = $1`,
    [demarche.id]
  );

  res.json({ ...demarche, etapes: etapes.rows, evenements: events.rows });
});

module.exports = router;
