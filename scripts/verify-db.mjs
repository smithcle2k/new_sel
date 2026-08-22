/**
 * Confirms the configured database is reachable, applies the schema, and
 * reports what is in it. Run by setup-deploy.sh after pushing credentials, and
 * useful on its own to check a deployment:
 *
 *   DATABASE_URL=... DATABASE_AUTH_TOKEN=... node scripts/verify-db.mjs
 */
const url = process.env.DATABASE_URL || '(default local file)';
console.log(`  connecting to ${url.replace(/\/\/.*@/, '//')}`);

try {
  // Imported lazily so a configuration error surfaces here, as a readable
  // message, rather than as an uncaught throw at module load.
  const { get, ready } = await import('../server/src/lib/db.js');
  await ready();

  const counts = {};
  for (const t of ['schools', 'users', 'classrooms', 'students', 'checkins', 'kiosk_devices']) {
    counts[t] = Number((await get(`SELECT COUNT(*) AS n FROM ${t}`)).n);
  }
  const indicators = Number((await get('SELECT COUNT(*) AS n FROM state_standards')).n);

  console.log(`  \u2713 schema applied; compliance catalog holds ${indicators} indicators`);
  console.log(`  \u2713 rows: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')}`);

  if (indicators !== 50) {
    console.error(`  ! expected 50 indicators, found ${indicators}`);
    process.exit(1);
  }
} catch (err) {
  const msg = String(err?.message ?? err);
  console.error(`  \u2717 could not verify the database: ${msg}`);
  if (/UNAUTHORIZED|401|token/i.test(msg)) {
    console.error('    The auth token looks wrong or expired. Mint a new one:');
    console.error('      turso db tokens create <database>');
  } else if (/ENOTFOUND|EAI_AGAIN|dns|getaddrinfo/i.test(msg)) {
    console.error('    That hostname did not resolve. Check DATABASE_URL against:');
    console.error('      turso db show <database> --url');
  }
  process.exit(1);
}
