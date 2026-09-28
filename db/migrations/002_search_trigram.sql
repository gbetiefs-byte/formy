-- Migration 002 : recherche approximative (fautes de frappe) et pertinence via pg_trgm

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_demarches_titre_trgm ON demarches USING GIN (titre gin_trgm_ops);
CREATE INDEX idx_demarches_description_trgm ON demarches USING GIN (description gin_trgm_ops);
