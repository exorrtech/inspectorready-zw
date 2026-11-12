// node-postgres does not implement channel_binding, so strip sslmode and
// channel_binding before handing the string to pg. TLS is explicit.
// Local Postgres (localhost/127.0.0.1) gets no SSL.
function parseDatabaseUrl(raw) {
  if (!raw) throw new Error('DATABASE_URL is required');
  const url = new URL(raw);
  url.searchParams.delete('sslmode');
  url.searchParams.delete('channel_binding');
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return {
    connectionString: url.toString(),
    ssl: isLocal ? false : { rejectUnauthorized: false },
  };
}

module.exports = { parseDatabaseUrl };
