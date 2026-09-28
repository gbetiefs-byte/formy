"use strict";

const pino = require("pino");

// Logs JSON structures en toute circonstance (pas de dependance pino-pretty a
// gerer dans l'image de production ; un outil comme `pino-pretty` peut etre
// branche cote developpeur via `npm start | npx pino-pretty` si souhaite).
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

module.exports = logger;
