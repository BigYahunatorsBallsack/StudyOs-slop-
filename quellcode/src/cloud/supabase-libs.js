/* Supabase-Bibliotheken als eigener Chunk: werden erst geladen, wenn jemand den Cloud-Sync benutzt. */
export { AuthClient } from "@supabase/auth-js";
export { PostgrestClient } from "@supabase/postgrest-js";
