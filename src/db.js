const { Pool } = require('pg');
const { parseDatabaseUrl } = require('./db-url');

const { connectionString, ssl } = parseDatabaseUrl(process.env.DATABASE_URL);

const pool = new Pool({
  connectionString,
  ssl,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

module.exports = pool;
