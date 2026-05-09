// load-env.js — imported first via `node --import ./load-env.js server.js`
// ES modules hoist all import statements, so calling config() inside server.js
// runs AFTER all imports — meaning db.js, cache.js etc. read undefined env vars.
// This file is loaded before any other module, guaranteeing .env is populated first.
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '.env') });
