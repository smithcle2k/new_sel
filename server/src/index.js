/** Local development entry point: a long-running server on a port. */
import 'dotenv/config';
import { createApp } from './app.js';
import { ready } from './lib/db.js';

const PORT = Number(process.env.PORT || 4000);

const count = await ready().then(() =>
  import('./lib/db.js').then(({ get }) => get('SELECT COUNT(*) AS n FROM state_standards')),
).then((r) => Number(r.n));

createApp().listen(PORT, () => {
  console.log(`My Day Buddy API listening on http://localhost:${PORT}`);
  console.log(`Compliance engine ready: ${count} state indicator mappings loaded.`);
});
