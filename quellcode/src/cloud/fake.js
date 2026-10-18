/* Ersatz-Backend nur für automatisierte Tests: Wenn die Testumgebung `window.__studyosFakeCloud`
   bereitstellt, spricht die App damit statt mit Supabase. Im echten Betrieb nie aktiv. */
export function createFakeCloud(call) {
  const KEY = "studyos-fake-user";
  const listeners = new Set();
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
  const set = (u) => { if (u) localStorage.setItem(KEY, JSON.stringify(u)); else localStorage.removeItem(KEY); listeners.forEach((f) => f(u)); };
  const uid = () => { const u = read(); if (!u) throw new Error("Nicht angemeldet."); return u.id; };
  return {
    push: {
      vapidKey: () => call("push.vapid"),
      saveSubscription: (sub, tz) => call("push.saveSubscription", uid(), sub, tz),
      removeSubscription: (endpoint) => call("push.removeSubscription", uid(), endpoint),
      saveDeadlines: (deadlines, tz) => call("push.saveDeadlines", uid(), deadlines, tz),
      setCalToken: (token) => call("push.setCalToken", uid(), token || null),
      test: () => call("push.test", uid()),
    },
    shares: {
      create: (token, blob) => call("shares.create", uid(), token, blob),
      get: async (token) => { const b = await call("shares.get", token); if (!b) throw new Error("Diesen Stapel gibt es nicht (mehr). Links laufen nach 180 Tagen ab."); return b; },
      remove: (token) => call("shares.remove", uid(), token),
    },
    calUrl: (token) => `https://example.supabase.co/functions/v1/studyos?action=cal&token=${token}`,
    files: {
      put: (id, bytes) => call("files.put", uid(), id, Array.from(bytes)),
      get: async (id) => { const a = await call("files.get", uid(), id); if (!a) throw new Error("Datei nicht in der Cloud gefunden."); return new Uint8Array(a); },
      remove: (id) => call("files.remove", uid(), id),
    },
    mvg: async (body) => { const r = await call("mvg", uid(), body); if (r && r.error) throw new Error(r.error); return r; },
    fetchIcs: async (url) => { const r = await call("ics", uid(), url); if (r && r.error) throw new Error(r.error); return r.text; },
    async getUser() { return read(); },
    onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    async sendCode(email) { await call("sendCode", email); },
    async verifyCode(email, code) { if (!(await call("verifyCode", email, code))) throw new Error("Der Code ist falsch oder abgelaufen. Fordere einen neuen an."); set({ id: "u-" + email, email }); },
    async signOut() { set(null); },
    remote: {
      get: () => call("get", uid()),
      insert: (payload) => call("insert", uid(), payload),
      update: (payload, version) => call("update", uid(), payload, version),
      remove: () => call("remove", uid()),
    },
  };
}
