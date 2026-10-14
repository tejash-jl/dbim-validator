// Load .env, .env.local etc. the same way Next.js does, so the worker and CLI see the same settings
// as the web app. Imported first by every script: modules such as src/lib/db.ts read env at load time.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
