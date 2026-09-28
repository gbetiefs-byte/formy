"use strict";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === "string" && EMAIL_RE.test(email) && email.length <= 254;
}

// Au moins 8 caracteres, une lettre et un chiffre : compromis simple
// entre securite et convivialite (pas d'exigence de caracteres speciaux
// qui pousse aux mots de passe "Password1!" peu robustes en pratique).
function isValidPassword(password) {
  if (typeof password !== "string" || password.length < 8) return false;
  return /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
}

module.exports = { isValidEmail, isValidPassword };
