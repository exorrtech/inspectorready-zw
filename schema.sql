-- InspectorReady ZW — schema.sql
-- Rebuild from scratch with: npm run db:setup
-- PostgreSQL 16+. Raw SQL, no ORM.

BEGIN;

DROP TABLE IF EXISTS compliance_items;
DROP TABLE IF EXISTS processing_activities;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS orgs;

CREATE TABLE orgs (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  registered_name TEXT,
  reg_number      TEXT,
  sector          TEXT NOT NULL,
  contact_email   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  org_id        INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'dpo')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE processing_activities (
  id                    SERIAL PRIMARY KEY,
  org_id                INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  data_subject_category TEXT NOT NULL,
  data_description      TEXT NOT NULL,
  is_sensitive          BOOLEAN NOT NULL DEFAULT false,
  purpose               TEXT NOT NULL,
  lawful_basis          TEXT NOT NULL CHECK (lawful_basis IN ('consent', 'contract', 'legal_obligation', 'legitimate_interest')),
  recipients            TEXT,
  storage_location      TEXT NOT NULL,
  cross_border          BOOLEAN NOT NULL DEFAULT false,
  retention             TEXT,
  security_measures     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE compliance_items (
  id            SERIAL PRIMARY KEY,
  org_id        INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'missing' CHECK (status IN ('missing', 'in_progress', 'done')),
  evidence_note TEXT,
  evidence_date DATE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

CREATE INDEX idx_users_org_id ON users(org_id);
CREATE INDEX idx_activities_org_id ON processing_activities(org_id);
CREATE INDEX idx_compliance_org_id ON compliance_items(org_id);

COMMIT;
