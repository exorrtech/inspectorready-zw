const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { parseDatabaseUrl } = require('../src/db-url');

let config;
try {
  config = parseDatabaseUrl(process.env.DATABASE_URL);
} catch {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: config.connectionString,
  ssl: config.ssl,
});

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Schema created: orgs, users, processing_activities, compliance_items.');
  await pool.end();
})().catch((err) => {
  console.error('Schema failed:', err.message);
  process.exit(1);
});
