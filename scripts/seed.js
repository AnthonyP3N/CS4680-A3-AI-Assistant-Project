// npm run seed   -> load two weeks of sample data (overwrites current data)
// npm run reset  -> start with an empty database
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, emptyDb } from '../lib/store.js';
import { buildSampleDb } from '../lib/seed.js';
import { localDate } from '../lib/dates.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.env.DATA_FILE || path.join(root, 'data', 'focusflow.json');
const store = new Store(file);
const tz = process.env.SEED_TZ || store.db.preferences.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

if (process.argv.includes('--empty')) {
  const db = emptyDb();
  db.preferences.timezone = tz;
  store.replace(db);
  console.log(`Reset ${file} to an empty database.`);
} else {
  store.replace(buildSampleDb(tz, localDate(new Date(), tz)));
  console.log(`Loaded sample data into ${file} (time zone ${tz}). Restart the server if it is running.`);
}
