"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_DAYS = 7;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (!secret || secret === "dev-secret-change-me") {
    if (isProd) {
      throw new Error(
        "JWT_SECRET manquant ou laisse a sa valeur par defaut. " +
          "Definissez une valeur forte et unique via la variable d'environnement JWT_SECRET avant de demarrer en production."
      );
    }
    return "dev-secret-change-me";
  }
  return secret;
}

function signAccessToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret());
}

function generateRefreshToken() {
  const raw = crypto.randomBytes(48).toString("hex");
  const hash = hashRefreshToken(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { raw, hash, expiresAt };
}

function hashRefreshToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

module.exports = {
  getJwtSecret,
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_DAYS,
};
