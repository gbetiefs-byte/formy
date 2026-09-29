"use strict";

const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db");
const { isValidEmail, isValidPassword } = require("../lib/validation");
const { signAccessToken, generateRefreshToken, hashRefreshToken } = require("../lib/tokens");
const { requireAuth, setAuthCookies, clearAuthCookies, REFRESH_COOKIE } = require("../middleware/auth");
const { isProfileComplete } = require("../lib/profile");
const franceconnect = require("./franceconnect");

const router = express.Router();

// Deux limiteurs distincts : un login abusif ne doit pas bloquer la
// création de compte (ni inversement) pour la même adresse IP.
function makeLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Trop de tentatives. Réessayez dans quelques minutes." },
  });
}
const registerLimiter = makeLimiter();
const loginLimiter = makeLimiter();

function publicUser(user) {
  const { password_hash, fc_sub, ...rest } = user;
  return rest;
}

async function issueSession(res, user) {
  const accessToken = signAccessToken(user);
  const { raw, hash, expiresAt } = generateRefreshToken();
  await pool.query(
    "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [user.id, hash, expiresAt]
  );
  setAuthCookies(res, accessToken, raw);
}

router.post("/register", registerLimiter, async (req, res) => {
  const { email, password, prenom, consent } = req.body || {};

  if (!isValidEmail(email)) return res.status(400).json({ error: "Adresse email invalide." });
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères, dont une lettre et un chiffre." });
  }
  if (!consent) {
    return res.status(400).json({ error: "Vous devez accepter la politique de confidentialité pour créer un compte." });
  }

  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "Un compte existe déjà avec cet email." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, prenom, consent_at) VALUES ($1, $2, $3, now())
     RETURNING id, email, role, prenom, age, situation_familiale, revenus, zone_geographique, statut, created_at`,
    [email, passwordHash, prenom || null]
  );

  const user = rows[0];
  await issueSession(res, user);
  res.status(201).json({ user });
});

router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email et mot de passe requis." });
  }

  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  const user = rows[0];
  if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Identifiants invalides." });
  }

  await issueSession(res, user);
  res.json({ user: publicUser(user) });
});

router.post("/refresh", async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) return res.status(401).json({ error: "Aucune session à renouveler." });

  const hash = hashRefreshToken(raw);
  const { rows } = await pool.query(
    `SELECT rt.*, u.id AS user_id, u.email, u.role FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > now()`,
    [hash]
  );
  const record = rows[0];
  if (!record) {
    clearAuthCookies(res);
    return res.status(401).json({ error: "Session expirée, merci de vous reconnecter." });
  }

  // Rotation : on revoque l'ancien refresh token et on en emet un nouveau.
  await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1", [record.id]);
  await issueSession(res, { id: record.user_id, email: record.email, role: record.role });

  res.json({ ok: true });
});

router.post("/logout", async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (raw) {
    await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1", [hashRefreshToken(raw)]);
  }
  clearAuthCookies(res);
  res.status(204).end();
});

router.get("/me", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, email, role, prenom, age, situation_familiale, revenus, zone_geographique, statut, created_at
     FROM users WHERE id = $1`,
    [req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Utilisateur introuvable." });
  res.json({ ...rows[0], profile_complete: isProfileComplete(rows[0]) });
});

router.use("/franceconnect", franceconnect);

module.exports = router;
