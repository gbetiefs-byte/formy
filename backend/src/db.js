"use strict";

const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.PGHOST || "db",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "formy",
  password: process.env.PGPASSWORD || "formy",
  database: process.env.PGDATABASE || "formy",
});

async function waitForDb(retries = 30, delayMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

module.exports = { pool, waitForDb };
