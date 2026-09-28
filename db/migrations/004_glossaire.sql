-- Migration 004 : lexique des sigles/termes administratifs, pour rendre le
-- contenu compréhensible sans connaissances préalables (accessibilité).

CREATE TABLE glossaire (
  id SERIAL PRIMARY KEY,
  terme TEXT UNIQUE NOT NULL,
  definition TEXT NOT NULL
);
