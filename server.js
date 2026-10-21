// Local preview server. FocusFlow is a static site (everything runs in the
// browser), so this only serves the public/ folder — exactly what GitHub
// Pages does once the site is published.

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.listen(PORT, () => {
  console.log(`\n  FocusFlow running at http://localhost:${PORT}`);
  console.log('  Add your own AI key in Settings, or use demo mode.\n');
});
