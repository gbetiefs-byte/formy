"use strict";

const { verifyAccessToken } = require("../lib/tokens");

const ACCESS_COOKIE = "formy_at";
const REFRESH_COOKIE = "formy_rt";

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const token = req.cookies?.[ACCESS_COOKIE] || bearerToken;

  if (!token) return res.status(401).json({ error: "Authentification requise." });

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session invalide ou expirée." });
  }
}

// Renseigne req.user si un token valide est présent, sans jamais bloquer la
// requête : utile pour des routes publiques (fiche démarche) qui enrichissent
// leur réponse quand l'utilisateur est connecté (ex : étapes déjà cochées).
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const token = req.cookies?.[ACCESS_COOKIE] || bearerToken;
  if (token) {
    try {
      req.user = verifyAccessToken(token);
    } catch (err) {
      // Token absent/expiré : on continue simplement en visiteur anonyme.
    }
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Accès réservé aux administrateurs." });
  }
  next();
}

// Volontairement découplé de NODE_ENV (qui vaut "production" dans l'image
// Docker même pour une démo locale en HTTP) : le flag Secure ne doit être
// activé que lorsque l'app est réellement servie en HTTPS, sous peine de
// voir les navigateurs (et tout client HTTP) refuser silencieusement le
// cookie. À positionner à "true" derrière un vrai reverse proxy TLS.
const COOKIE_BASE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.COOKIE_SECURE === "true",
};

function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...COOKIE_BASE_OPTIONS, maxAge: 15 * 60 * 1000 });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...COOKIE_BASE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/api/auth", // le refresh token ne part que vers /api/auth/*
  });
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, COOKIE_BASE_OPTIONS);
  res.clearCookie(REFRESH_COOKIE, { ...COOKIE_BASE_OPTIONS, path: "/api/auth" });
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireAdmin,
  setAuthCookies,
  clearAuthCookies,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
};
