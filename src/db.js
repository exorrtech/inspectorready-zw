const { Pool } = require('pg');

const raw = process.env.DATABASE_URL;
if (!raw) {
  throw new Error('DATABASE_URL is required');
}

// node-postgres handles TLS itself; channel_binding is not implemented there.
const url = new URL(raw);
url.searchParams.delete('channel_binding');
url.searchParams.delete('sslmode');

const pool = new Pool({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

module.exports = pool;
