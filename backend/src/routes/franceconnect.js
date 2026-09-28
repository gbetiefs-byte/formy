"use strict";

// Integration FranceConnect (OIDC "Particulier").
//
// FranceConnect exige un enregistrement prealable aupres de la DINUM pour
// obtenir un client_id/client_secret (bac a sable "integration01" puis
// production). Ce module est un scaffold complet et fonctionnel du flux
// OIDC : une fois les identifiants obtenus, il suffit de renseigner les
// variables d'environnement FC_CLIENT_ID / FC_CLIENT_SECRET / FC_ISSUER /
// FC_REDIRECT_URI pour que la connexion FranceConnect fonctionne de bout en
// bout, sans modification de code. Tant que ces variables sont absentes,
// les routes repondent explicitement 501 (et le bouton est masque cote
// frontend) plutot que de simuler une fausse identite FranceConnect.

const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db");
const { signAccessToken, generateRefreshToken } = require("../lib/tokens");
const { setAuthCookies } = require("../middleware/auth");
const logger = require("../logger");

const router = express.Router();

const STATE_COOKIE = "formy_fc_state";

function config() {
  const { FC_CLIENT_ID, FC_CLIENT_SECRET, FC_ISSUER, FC_REDIRECT_URI, FRONTEND_URL } = process.env;
  if (!FC_CLIENT_ID || !FC_CLIENT_SECRET || !FC_ISSUER || !FC_REDIRECT_URI) return null;
  return {
    clientId: FC_CLIENT_ID,
    clientSecret: FC_CLIENT_SECRET,
    issuer: FC_ISSUER.replace(/\/$/, ""),
    redirectUri: FC_REDIRECT_URI,
    frontendUrl: FRONTEND_URL || "/",
  };
}

router.get("/status", (req, res) => {
  res.json({ enabled: config() !== null });
});

router.get("/login", (req, res) => {
  const cfg = config();
  if (!cfg) {
    return res.status(501).json({
      error: "FranceConnect n'est pas configuré sur cette instance (FC_CLIENT_ID / FC_ISSUER manquants).",
    });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const nonce = crypto.randomBytes(16).toString("hex");
  res.cookie(STATE_COOKIE, JSON.stringify({ state, nonce }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 5 * 60 * 1000,
    path: "/api/auth/franceconnect",
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: "openid profile email",
    state,
    nonce,
    acr_values: "eidas1",
  });

  res.redirect(`${cfg.issuer}/api/v1/authorize?${params.toString()}`);
});

router.get("/callback", async (req, res) => {
  const cfg = config();
  if (!cfg) return res.status(501).json({ error: "FranceConnect n'est pas configuré." });

  const { code, state } = req.query;
  let stored;
  try {
    stored = JSON.parse(req.cookies?.[STATE_COOKIE] || "null");
  } catch {
    stored = null;
  }
  res.clearCookie(STATE_COOKIE, { path: "/api/auth/franceconnect" });

  if (!code || !state || !stored || state !== stored.state) {
    return res.status(400).json({ error: "Requête FranceConnect invalide ou expirée." });
  }

  try {
    const tokenRes = await fetch(`${cfg.issuer}/api/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
      }),
    });
    if (!tokenRes.ok) throw new Error(`Echange de code FranceConnect refusé (${tokenRes.status}).`);
    const tokenData = await tokenRes.json();

    const userInfoRes = await fetch(`${cfg.issuer}/api/v1/userinfo?schema=openid`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userInfoRes.ok) throw new Error(`Récupération du profil FranceConnect refusée (${userInfoRes.status}).`);
    const profile = await userInfoRes.json();

    const email = profile.email;
    const fcSub = profile.sub;
    const prenom = profile.given_name || null;

    let { rows } = await pool.query("SELECT * FROM users WHERE fc_sub = $1", [fcSub]);
    let user = rows[0];

    if (!user && email) {
      const byEmail = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
      user = byEmail.rows[0];
      if (user) {
        await pool.query("UPDATE users SET fc_sub = $1 WHERE id = $2", [fcSub, user.id]);
      }
    }

    if (!user) {
      const inserted = await pool.query(
        `INSERT INTO users (email, fc_sub, prenom, consent_at) VALUES ($1, $2, $3, now()) RETURNING *`,
        [email, fcSub, prenom]
      );
      user = inserted.rows[0];
    }

    const accessToken = signAccessToken(user);
    const { raw, hash, expiresAt } = generateRefreshToken();
    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
      [user.id, hash, expiresAt]
    );
    setAuthCookies(res, accessToken, raw);

    res.redirect(cfg.frontendUrl);
  } catch (err) {
    logger.error({ err }, "Echec de l'authentification FranceConnect");
    res.redirect(`${cfg.frontendUrl}?fc_error=1`);
  }
});

module.exports = router;
