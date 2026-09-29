"use strict";

require("express-async-errors");

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const pinoHttp = require("pino-http");

const logger = require("./logger");
const { pool, waitForDb } = require("./db");
const migrate = require("./migrate");
const seed = require("./seed/seed");
const ssr = require("./ssr");

const authRoutes = require("./routes/auth");
const profileRoutes = require("./routes/profile");
const catalogueRoutes = require("./routes/catalogue");
const progressRoutes = require("./routes/progress");
const adminRoutes = require("./routes/admin");
const { requireCompleteProfile, ssrGate } = require("./middleware/profile");

const app = express();
const PORT = process.env.PORT || 3000;
const frontendDir = path.join(__dirname, "..", "public");

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
      },
    },
  })
);

const allowedOrigins = (process.env.CORS_ORIGINS || "").split(",").filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json());
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
// Parcours imposé : inscription -> profil personnalisé -> accès aux ressources.
// Le catalogue et le suivi ne sont servis qu'aux comptes au profil complet.
app.use(["/api/categories", "/api/life-events", "/api/demarches"], requireCompleteProfile);
app.use("/api", catalogueRoutes);
app.use("/api/progress", requireCompleteProfile, progressRoutes);
app.use("/api/admin", adminRoutes);

// --- Pages rendues côté serveur, réservées aux comptes au profil complet ---
// Sinon la requête tombe sur la coquille SPA ci-dessous, et le routeur client
// redirige vers l'inscription ou la personnalisation du profil.
app.get("/", ssrGate, ssr.renderHome);
app.get("/catalogue", ssrGate, ssr.renderCatalogue);
app.get("/evenements", ssrGate, ssr.renderEvenements);
app.get("/evenements/:slug", ssrGate, ssr.renderEvenementDetail);
app.get("/demarches/:slug", ssrGate, ssr.renderDemarcheDetail);
app.get("/sitemap.xml", ssr.sitemap);
app.get("/robots.txt", ssr.robots);

// index:false : sans cela, "/" servirait public/index.html (redirection vers
// "/") au lieu de la coquille SPA quand ssrGate laisse passer la requête.
app.use(express.static(frontendDir, { index: false }));

// Pages nécessitant une connexion / utilitaires : coquille SPA générique,
// le routeur client (app.js) affiche le bon contenu.
app.get(/^(?!\/api).*/, (req, res) => {
  res.send(
    ssr.shell({
      title: "Formy",
      description: "Formy — assistant numérique pour les démarches administratives françaises.",
      canonicalPath: req.path,
      bodyHtml: "",
    })
  );
});

// Handler d'erreur centralisé. Grâce à `express-async-errors`, les erreurs
// levées dans les routes async remontent bien ici au lieu de rester muettes.
app.use((err, req, res, next) => {
  req.log?.error({ err }, "Erreur non gérée");
  logger.error({ err }, "Erreur non gérée");
  res.status(500).json({ error: "Erreur interne du serveur." });
});

let server;

async function start() {
  logger.info("Connexion à la base de données...");
  await waitForDb();
  logger.info("Base de données prête.");

  await migrate.run();
  await seed.run();

  server = app.listen(PORT, () => {
    logger.info({ port: PORT }, "API Formy démarrée");
  });
}

async function shutdown(signal) {
  logger.info({ signal }, "Arrêt en cours...");
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.end();
  logger.info("Arrêt propre terminé.");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start().catch((err) => {
  logger.error({ err }, "Échec du démarrage");
  process.exit(1);
});

module.exports = app;
