-- Migration 001 : schema initial

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  prenom TEXT,
  age INTEGER,
  situation_familiale TEXT,
  revenus TEXT,
  zone_geographique TEXT,
  statut TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  nom TEXT NOT NULL,
  icone TEXT
);

CREATE TABLE life_events (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  nom TEXT NOT NULL,
  description TEXT,
  icone TEXT
);

CREATE TABLE demarches (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  titre TEXT NOT NULL,
  description TEXT,
  delai TEXT,
  duree_estimee TEXT,
  documents_requis TEXT[] NOT NULL DEFAULT '{}',
  pieges TEXT[] NOT NULL DEFAULT '{}',
  lien_officiel TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE demarche_etapes (
  id SERIAL PRIMARY KEY,
  demarche_id INTEGER NOT NULL REFERENCES demarches(id) ON DELETE CASCADE,
  ordre INTEGER NOT NULL,
  titre TEXT NOT NULL,
  description TEXT
);

CREATE TABLE demarche_life_events (
  demarche_id INTEGER NOT NULL REFERENCES demarches(id) ON DELETE CASCADE,
  life_event_id INTEGER NOT NULL REFERENCES life_events(id) ON DELETE CASCADE,
  PRIMARY KEY (demarche_id, life_event_id)
);

CREATE TABLE user_progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  demarche_id INTEGER NOT NULL REFERENCES demarches(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'en_cours', 'termine')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, demarche_id)
);

CREATE TABLE user_step_progress (
  id SERIAL PRIMARY KEY,
  user_progress_id INTEGER NOT NULL REFERENCES user_progress(id) ON DELETE CASCADE,
  etape_id INTEGER NOT NULL REFERENCES demarche_etapes(id) ON DELETE CASCADE,
  done BOOLEAN NOT NULL DEFAULT false,
  done_at TIMESTAMPTZ,
  UNIQUE (user_progress_id, etape_id)
);

CREATE INDEX idx_demarches_category ON demarches(category_id);
CREATE INDEX idx_demarche_etapes_demarche ON demarche_etapes(demarche_id);
CREATE INDEX idx_user_progress_user ON user_progress(user_id);
