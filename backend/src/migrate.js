"use strict";

const fs = require("fs");
const path = require("path");
const { pool } = require("./db");
const logger = require("./logger");

// En conteneur, MIGRATIONS_DIR est fixé par le Dockerfile (le contexte de
// build est la racine du dépôt). En développement local (hors Docker), on
// retombe sur le chemin relatif réel : backend/src -> ../../db/migrations.
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || path.join(__dirname, "..", "..", "db", "migrations");

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows } = await pool.query("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      logger.info({ migration: file }, "Migration appliquee");
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Echec de la migration ${file}: ${err.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = { run };
