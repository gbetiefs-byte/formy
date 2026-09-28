"use strict";

// Rendu HTML côté serveur, minimal mais réel, pour les pages publiques à
// forte valeur SEO (accueil, catalogue, fiches démarches, événements de
// vie). Le contenu essentiel (titre, description, liste) est présent dans
// le HTML initial pour être indexable par les moteurs de recherche, même
// sans exécution JS. Le frontend (app.js) prend ensuite le relais pour
// l'interactivité (checklist, recherche live, auth...), en réutilisant le
// même conteneur #app — pas de double rendu visible pour l'utilisateur.

const { pool } = require("./db");

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let glossaryCache = null;
async function getGlossary() {
  if (!glossaryCache) {
    const { rows } = await pool.query("SELECT terme, definition FROM glossaire ORDER BY length(terme) DESC");
    glossaryCache = rows;
  }
  return glossaryCache;
}

// Équivalent serveur de jargonize() côté client : entoure chaque sigle
// reconnu d'un <abbr title="..."> natif, qui fonctionne même sans JS.
async function escapeAndAnnotate(text = "") {
  const glossary = await getGlossary();
  const escaped = escapeHtml(text);
  if (glossary.length === 0) return escaped;
  const pattern = new RegExp(`\\b(${glossary.map((g) => g.terme).join("|")})\\b`, "g");
  return escaped.replace(pattern, (match) => {
    const entry = glossary.find((g) => g.terme === match);
    return `<abbr class="jargon" title="${escapeHtml(entry.definition)}" tabindex="0">${match}</abbr>`;
  });
}

function shell({ title, description, canonicalPath, bodyHtml }) {
  const base = process.env.PUBLIC_BASE_URL || "";
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${base}${canonicalPath}" />
  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#176b5b" />
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <a href="#main" class="skip-link">Aller au contenu principal</a>
  <header class="topbar">
    <a href="/" class="brand" data-link><span class="brand-mark" aria-hidden="true">F</span>Formy</a>
    <nav id="nav" class="nav"></nav>
    <button id="nav-toggle" class="nav-toggle" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="nav">Menu</button>
  </header>

  <main id="app" class="app">${bodyHtml}</main>

  <footer class="footer">
    <p>Formy — gratuit, sans distinction premium. Les informations affichées sont indicatives : vérifiez toujours auprès des sites officiels liés.</p>
    <p><a href="/confidentialite" data-link>Confidentialité</a> · <a href="/cgu" data-link>CGU</a></p>
  </footer>

  <script src="/app.js" defer></script>
</body>
</html>`;
}

async function renderHome(req, res) {
  res.send(
    shell({
      title: "Formy — Vos démarches administratives simplifiées",
      description:
        "Formy transforme chaque démarche administrative française en checklist claire : étapes, délais réels, documents requis et pièges à éviter. Gratuit, sans distinction premium.",
      canonicalPath: "/",
      bodyHtml: `
        <section class="home-hero">
          <p class="eyebrow">VOS DÉMARCHES, EN CLAIR</p>
          <h1>Les démarches administratives, étape par étape.</h1>
          <p class="subtitle">Documents à préparer, délais à respecter et étapes à suivre : retrouvez l’essentiel pour avancer sereinement.</p>
          <div class="toolbar">
            <a class="btn" href="/catalogue" data-link>Explorer les démarches</a>
            <a class="btn secondary" href="/evenements" data-link>Partir de ma situation</a>
          </div>
          <p class="home-proof"><strong>137 démarches</strong> classées par thème et événement de vie</p>
        </section>`,
    })
  );
}

async function renderCatalogue(req, res) {
  const { rows: demarches } = await pool.query("SELECT slug, titre, description FROM demarches ORDER BY titre");
  const items = demarches
    .map(
      (d) => `<a class="card" href="/demarches/${d.slug}" data-link><h3>${escapeHtml(d.titre)}</h3><p>${escapeHtml(d.description || "")}</p></a>`
    )
    .join("");

  res.send(
    shell({
      title: "Catalogue des démarches administratives — Formy",
      description: `Parcourez ${demarches.length} démarches administratives françaises expliquées pas à pas : CAF, impôts, France Travail, CPAM, préfecture...`,
      canonicalPath: "/catalogue",
      bodyHtml: `
        <h1>Catalogue des démarches</h1>
        <p class="subtitle">${demarches.length} démarches disponibles, gratuitement.</p>
        <div class="grid">${items}</div>`,
    })
  );
}

async function renderEvenements(req, res) {
  const { rows: events } = await pool.query("SELECT slug, nom, description FROM life_events ORDER BY nom");
  const items = events
    .map(
      (e) => `<a class="card" href="/evenements/${e.slug}" data-link><h3>${escapeHtml(e.nom)}</h3><p>${escapeHtml(e.description || "")}</p></a>`
    )
    .join("");

  res.send(
    shell({
      title: "Événements de vie — Formy",
      description: "Naissance, perte d'emploi, déménagement, mariage... retrouvez toutes les démarches liées à votre situation.",
      canonicalPath: "/evenements",
      bodyHtml: `<h1>Qu'est-ce qui vous arrive ?</h1><p class="subtitle">Formy regroupe automatiquement toutes les démarches liées à votre situation.</p><div class="life-events-grid">${items}</div>`,
    })
  );
}

async function renderEvenementDetail(req, res) {
  const { rows: events } = await pool.query("SELECT * FROM life_events WHERE slug = $1", [req.params.slug]);
  const event = events[0];
  if (!event) return res.status(404).send(shell({ title: "Page introuvable — Formy", description: "", canonicalPath: req.path, bodyHtml: "<h1>Page introuvable</h1>" }));

  const { rows: demarches } = await pool.query(
    `SELECT d.slug, d.titre, d.description FROM demarches d
     JOIN demarche_life_events dle ON dle.demarche_id = d.id
     JOIN life_events le ON le.id = dle.life_event_id
     WHERE le.slug = $1 ORDER BY d.titre`,
    [req.params.slug]
  );
  const items = demarches
    .map((d) => `<a class="card" href="/demarches/${d.slug}" data-link><h3>${escapeHtml(d.titre)}</h3><p>${escapeHtml(d.description || "")}</p></a>`)
    .join("");

  res.send(
    shell({
      title: `${event.nom} — Formy`,
      description: event.description || "",
      canonicalPath: `/evenements/${event.slug}`,
      bodyHtml: `<h1>${escapeHtml(event.nom)}</h1><p class="subtitle">${escapeHtml(event.description || "")}</p><h2>${demarches.length} démarche(s) à effectuer</h2><div class="grid">${items}</div>`,
    })
  );
}

async function renderDemarcheDetail(req, res) {
  const { rows } = await pool.query(
    `SELECT d.*, c.nom AS category_nom FROM demarches d JOIN categories c ON c.id = d.category_id WHERE d.slug = $1`,
    [req.params.slug]
  );
  const demarche = rows[0];
  if (!demarche) return res.status(404).send(shell({ title: "Page introuvable — Formy", description: "", canonicalPath: req.path, bodyHtml: "<h1>Page introuvable</h1>" }));

  const { rows: etapes } = await pool.query(
    "SELECT titre, description FROM demarche_etapes WHERE demarche_id = $1 ORDER BY ordre",
    [demarche.id]
  );

  const stepsHtml = (
    await Promise.all(
      etapes.map(async (e, idx) => `<li>${idx + 1}. <strong>${await escapeAndAnnotate(e.titre)}</strong> — ${await escapeAndAnnotate(e.description || "")}</li>`)
    )
  ).join("");
  const docsHtml = (await Promise.all((demarche.documents_requis || []).map(async (d) => `<li>${await escapeAndAnnotate(d)}</li>`))).join("");
  const piegesHtml = (await Promise.all((demarche.pieges || []).map(async (p) => `<li>${await escapeAndAnnotate(p)}</li>`))).join("");

  res.send(
    shell({
      title: `${demarche.titre} : démarches, délais et documents — Formy`,
      description: demarche.description || "",
      canonicalPath: `/demarches/${demarche.slug}`,
      bodyHtml: `
        <h1>${escapeHtml(demarche.titre)}</h1>
        <p class="subtitle">${await escapeAndAnnotate(demarche.description || "")}</p>
        <p class="notice">Catégorie : ${escapeHtml(demarche.category_nom)} — vérifié le ${new Date(demarche.verified_at).toLocaleDateString("fr-FR")}</p>
        <div class="info-block"><h4>Délai</h4><p>${await escapeAndAnnotate(demarche.delai || "Non précisé")}</p></div>
        <div class="info-block"><h4>Documents nécessaires</h4><ul>${docsHtml}</ul></div>
        <h2>Étapes à suivre</h2>
        <ol class="steps-static">${stepsHtml}</ol>
        <div class="info-block pieges"><h4>Pièges à éviter</h4><ul>${piegesHtml}</ul></div>`,
    })
  );
}

async function sitemap(req, res) {
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  const [demarches, events] = await Promise.all([
    pool.query("SELECT slug FROM demarches"),
    pool.query("SELECT slug FROM life_events"),
  ]);

  const urls = [
    `${base}/`,
    `${base}/catalogue`,
    `${base}/evenements`,
    ...events.rows.map((e) => `${base}/evenements/${e.slug}`),
    ...demarches.rows.map((d) => `${base}/demarches/${d.slug}`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>`;

  res.type("application/xml").send(xml);
}

function robots(req, res) {
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  res.type("text/plain").send(`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
}

module.exports = {
  shell,
  renderHome,
  renderCatalogue,
  renderEvenements,
  renderEvenementDetail,
  renderDemarcheDetail,
  sitemap,
  robots,
};
