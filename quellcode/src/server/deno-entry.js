/* Einstieg für Supabase Edge Functions (Deno). Wird von build.mjs zu supabase/functions/studyos/index.ts gebündelt. */
import { createHandler } from "./handler.js";

const env = new Proxy({}, { get: (_, key) => Deno.env.get(String(key)) });
/* STUDYOS_NOW nur für automatisierte Tests: feste Uhrzeit statt der echten */
const now = () => (env.STUDYOS_NOW ? new Date(env.STUDYOS_NOW) : new Date());
Deno.serve(createHandler({ env, now }));
