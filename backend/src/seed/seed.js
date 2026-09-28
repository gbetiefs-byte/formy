"use strict";

const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const logger = require("../logger");
const { categories, lifeEvents, demarches } = require("./data");
const glossary = require("./glossary");

// Étape ajoutée systématiquement à la fin de CHAQUE démarche : vraie pour
// les 137 procédures du catalogue, et trop souvent oubliée dans un conseil
// administratif. Centralisée ici plutôt que dupliquée 137 fois dans
// data.js — une seule formulation à maintenir, garantie de cohérence.
const UNIVERSAL_LAST_STEP = {
  titre: "Conservez une preuve de votre démarche",
  description:
    "Récépissé, accusé de réception, capture d'écran de la confirmation, numéro de dossier... Gardez une trace datée : elle vous sera utile en cas de litige, de perte du document, ou si le traitement prend anormalement longtemps.",
};

// Seed idempotent, exécuté à CHAQUE démarrage : upsert sur les slugs plutôt
// qu'un simple "si la table n'est pas vide, ne rien faire". Une mise à jour
// de data.js (nouveau délai, nouvelle démarche, étape corrigée) se propage
// donc automatiquement aux instances déjà déployées.
async function run() {
  await seedCatalogue();
  await seedGlossaire();
  await seedAdmin();
}

async function seedCatalogue() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const categoryIds = {};
    for (const cat of categories) {
      const { rows } = await client.query(
        `INSERT INTO categories (slug, nom, icone) VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom, icone = EXCLUDED.icone
         RETURNING id`,
        [cat.slug, cat.nom, cat.icone]
      );
      categoryIds[cat.slug] = rows[0].id;
    }

    const lifeEventIds = {};
    for (const evt of lifeEvents) {
      const { rows } = await client.query(
        `INSERT INTO life_events (slug, nom, description, icone) VALUES ($1, $2, $3, $4)
         ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom, description = EXCLUDED.description, icone = EXCLUDED.icone
         RETURNING id`,
        [evt.slug, evt.nom, evt.description, evt.icone]
      );
      lifeEventIds[evt.slug] = rows[0].id;
    }

    for (const dem of demarches) {
      const categoryId = categoryIds[dem.categorySlug];
      if (!categoryId) throw new Error(`Catégorie inconnue: ${dem.categorySlug} (démarche ${dem.slug})`);

      const { rows } = await client.query(
        `INSERT INTO demarches (slug, category_id, titre, description, delai, duree_estimee, documents_requis, pieges, lien_officiel, verified_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE)
         ON CONFLICT (slug) DO UPDATE SET
           category_id = EXCLUDED.category_id,
           titre = EXCLUDED.titre,
           description = EXCLUDED.description,
           delai = EXCLUDED.delai,
           duree_estimee = EXCLUDED.duree_estimee,
           documents_requis = EXCLUDED.documents_requis,
           pieges = EXCLUDED.pieges,
           lien_officiel = EXCLUDED.lien_officiel,
           verified_at = CASE
             WHEN demarches.titre IS DISTINCT FROM EXCLUDED.titre
               OR demarches.description IS DISTINCT FROM EXCLUDED.description
               OR demarches.delai IS DISTINCT FROM EXCLUDED.delai
               OR demarches.documents_requis IS DISTINCT FROM EXCLUDED.documents_requis
               OR demarches.pieges IS DISTINCT FROM EXCLUDED.pieges
             THEN CURRENT_DATE ELSE demarches.verified_at
           END
         RETURNING id`,
        [dem.slug, categoryId, dem.titre, dem.description, dem.delai, dem.dureeEstimee, dem.documents, dem.pieges, dem.lienOfficiel]
      );
      const demarcheId = rows[0].id;

      // Etapes : on resynchronise entierement (delete + reinsert) pour
      // refleter fidelement l'ordre et le contenu de data.js.
      await client.query("DELETE FROM demarche_etapes WHERE demarche_id = $1", [demarcheId]);
      const etapesCompletes = [...dem.etapes, UNIVERSAL_LAST_STEP];
      for (let idx = 0; idx < etapesCompletes.length; idx++) {
        const etape = etapesCompletes[idx];
        await client.query(
          "INSERT INTO demarche_etapes (demarche_id, ordre, titre, description) VALUES ($1, $2, $3, $4)",
          [demarcheId, idx + 1, etape.titre, etape.description]
        );
      }

      await client.query("DELETE FROM demarche_life_events WHERE demarche_id = $1", [demarcheId]);
      for (const eventSlug of dem.evenements) {
        const lifeEventId = lifeEventIds[eventSlug];
        if (!lifeEventId) throw new Error(`Événement de vie inconnu: ${eventSlug} (démarche ${dem.slug})`);
        await client.query(
          "INSERT INTO demarche_life_events (demarche_id, life_event_id) VALUES ($1, $2)",
          [demarcheId, lifeEventId]
        );
      }
    }

    await client.query("COMMIT");
    logger.info(
      { categories: categories.length, lifeEvents: lifeEvents.length, demarches: demarches.length },
      "Catalogue synchronisé"
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function seedGlossaire() {
  for (const entry of glossary) {
    await pool.query(
      `INSERT INTO glossaire (terme, definition) VALUES ($1, $2)
       ON CONFLICT (terme) DO UPDATE SET definition = EXCLUDED.definition`,
      [entry.terme, entry.definition]
    );
  }
  logger.info({ termes: glossary.length }, "Lexique synchronisé");
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || "admin@formy.fr";
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";

  const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (rows.length > 0) {
    logger.info({ email }, "Compte administrateur déjà présent");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (email, password_hash, role, prenom, consent_at)
     VALUES ($1, $2, 'admin', 'Admin', now())`,
    [email, passwordHash]
  );
  logger.info({ email }, "Compte administrateur créé");
}

module.exports = { run };
