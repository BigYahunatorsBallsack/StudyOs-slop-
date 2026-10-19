/* runtime.js setzt window.STUDYOS_ENV; der Import sorgt dafür, dass das auch bei aufgeteilten Chunks vorher passiert. */
import "../runtime.js";

export const ENV = typeof window !== "undefined" && window.STUDYOS_ENV ? window.STUDYOS_ENV : null;
