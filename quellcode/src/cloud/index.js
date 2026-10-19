import { createFakeCloud } from "./fake.js";
import { createSupabaseCloud } from "./supabase.js";

let instance;
/** Liefert das Cloud-Backend (einmalig erzeugt) oder null, wenn kein Projekt konfiguriert ist. */
export function getCloud() {
  if (instance !== undefined) return instance;
  if (typeof window === "undefined") return (instance = null);
  instance = typeof window.__studyosFakeCloud === "function" ? createFakeCloud(window.__studyosFakeCloud) : createSupabaseCloud();
  return instance;
}
