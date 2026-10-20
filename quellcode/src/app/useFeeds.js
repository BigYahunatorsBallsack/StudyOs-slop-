/* Kalender-Abos: Stundenplan (TUMonline), Moodle- und Artemis-Abgaben. Abruf über die Edge Function, Abgleich in lib/feed.js bzw. lib/moodle.js. */
import { useEffect, useRef } from "react";
import { FEED_VERSION, applyExams, applyFeed, examModuleOf, resolveNewModules, unmappedSummaries } from "../lib/feed.js";
import { parseICS } from "../lib/ics.js";
import { applyArtemis, applyMoodle, unmappedCourses } from "../lib/moodle.js";
import { iso, uid } from "../lib/util.js";

export function useFeeds({ ready, loadError, cloud, data, dataRef, change }) {
  const syncFeedRef = useRef(null);
  /* Prüfungstermine aus dem Stundenplan- bzw. Artemis-Abo als Prüfungen anlegen; `stats.exams` zählt die neuen */
  const withExams = (d, next, stats, events, moduleOf, prefix) => {
    const r = applyExams(next, events, moduleOf, { prefix, dismissed: d.settings.examsDismissed || [] });
    return { stats: { ...stats, exams: r.stats.added }, next: r.stats.added || r.stats.updated ? { ...next, exams: r.exams } : next };
  };
  const tumExams = (d, next, stats, events, map) => withExams(d, next, stats, events, (e) => examModuleOf(e, map, next.modules), "tum");
  /* Ergebnis aus dem aktuellen Stand berechnen und übernehmen; hat sich der Stand inzwischen geändert, neu berechnen */
  const commitFeed = (compute) => {
    const base = dataRef.current, res = compute(base);
    change((d) => (d === base ? res.next : compute(d).next));
    return res.stats;
  };
  /* Stundenplan-Abo abrufen und abgleichen; automatisch, wenn der letzte Abruf über 6 Stunden her ist */
  syncFeedRef.current = async ({ manual } = {}) => {
    const feed = dataRef.current.settings.icsFeed;
    if (!feed || !feed.url || cloud.phase !== "ready") return null;
    try {
      const events = parseICS(await cloud.fetchIcs(feed.url));
      return commitFeed((d) => {
        const r = applyFeed(d, events, d.settings.icsFeed.map);
        return tumExams(d, { ...d, sessions: r.sessions, notes: r.notes, settings: { ...d.settings, icsFeed: { ...d.settings.icsFeed, v: FEED_VERSION, lastSync: new Date().toISOString(), pending: unmappedSummaries(events, d.settings.icsFeed.map), lastError: "" } } }, r.stats, events, d.settings.icsFeed.map);
      });
    } catch (e) {
      if (manual) throw e;
      change((d) => (d.settings.icsFeed ? { ...d, settings: { ...d.settings, icsFeed: { ...d.settings.icsFeed, lastError: e.message || String(e) } } } : d));
      return null;
    }
  };
  /* Moodle-Fristen: gleiches Muster wie das Stundenplan-Abo */
  const syncMoodleRef = useRef(null);
  syncMoodleRef.current = async ({ manual } = {}) => {
    const feed = dataRef.current.settings.moodleFeed;
    if (!feed || !feed.url || cloud.phase !== "ready") return null;
    try {
      const events = parseICS(await cloud.fetchIcs(feed.url));
      return commitFeed((d) => {
        const mf = d.settings.moodleFeed;
        const r = applyMoodle(d, events, mf.map, iso(), mf.dismissed || [], "moodle", mf.url);
        return { stats: r.stats, next: { ...d, homework: r.homework, settings: { ...d.settings, moodleFeed: { ...mf, lastSync: new Date().toISOString(), pending: unmappedCourses(events, mf.map), lastError: "" } } } };
      });
    } catch (e) {
      if (manual) throw e;
      change((d) => (d.settings.moodleFeed ? { ...d, settings: { ...d.settings, moodleFeed: { ...d.settings.moodleFeed, lastError: e.message || String(e) } } } : d));
      return null;
    }
  };
  /* Artemis: ein Abo je Kurs */
  const syncArtemisRef = useRef(null);
  syncArtemisRef.current = async ({ manual } = {}) => {
    const feeds = dataRef.current.settings.artemisFeeds || [];
    if (!feeds.length || cloud.phase !== "ready") return null;
    const total = { added: 0, updated: 0, exams: 0 };
    for (const f of feeds) {
      try {
        const events = parseICS(await cloud.fetchIcs(f.url));
        const st = commitFeed((d) => {
          const cur = (d.settings.artemisFeeds || []).find((x) => x.id === f.id);
          if (!cur) return { stats: { added: 0, updated: 0 }, next: d };
          const r = applyArtemis(d, cur, events);
          return withExams(d, { ...d, homework: r.homework, settings: { ...d.settings, artemisFeeds: d.settings.artemisFeeds.map((x) => (x.id === f.id ? { ...x, lastSync: new Date().toISOString(), lastError: "" } : x)) } }, r.stats, events, () => cur.moduleId, `artemis:${cur.id}`);
        });
        total.added += st.added; total.updated += st.updated; total.exams += st.exams || 0;
      } catch (e) {
        if (manual) throw e;
        change((d) => ({ ...d, settings: { ...d.settings, artemisFeeds: (d.settings.artemisFeeds || []).map((x) => (x.id === f.id ? { ...x, lastError: e.message || String(e) } : x)) } }));
      }
    }
    return total;
  };
  const artemisDue = (data.settings.artemisFeeds || []).some((f) => !f.lastSync || Date.now() - new Date(f.lastSync).getTime() > 3 * 3600 * 1000);
  useEffect(() => {
    if (!ready || loadError || cloud.phase !== "ready" || !artemisDue) return;
    const id = setTimeout(() => syncArtemisRef.current(), 8000);
    return () => clearTimeout(id);
  }, [ready, loadError, cloud.phase, artemisDue]);

  const moodleDue = !!data.settings.moodleFeed?.url && (!data.settings.moodleFeed.lastSync || Date.now() - new Date(data.settings.moodleFeed.lastSync).getTime() > 3 * 3600 * 1000);
  useEffect(() => {
    if (!ready || loadError || cloud.phase !== "ready" || !moodleDue) return;
    const id = setTimeout(() => syncMoodleRef.current(), 6000);
    return () => clearTimeout(id);
  }, [ready, loadError, cloud.phase, moodleDue]);

  const feedDue = !!data.settings.icsFeed?.url && (!data.settings.icsFeed.lastSync || (data.settings.icsFeed.v || 1) < FEED_VERSION || Date.now() - new Date(data.settings.icsFeed.lastSync).getTime() > 6 * 3600 * 1000);
  useEffect(() => {
    if (!ready || loadError || cloud.phase !== "ready" || !feedDue) return;
    const id = setTimeout(() => syncFeedRef.current(), 4000);
    return () => clearTimeout(id);
  }, [ready, loadError, cloud.phase, feedDue]);

  return {
    /* Stundenplan-Abo */
    subscribeFeed: async (url, draftMap, events) => commitFeed((d) => {
      const { modules, map } = resolveNewModules(d, draftMap);
      const r = applyFeed({ ...d, modules }, events, map);
      return tumExams(d, { ...d, modules, sessions: r.sessions, notes: r.notes, settings: { ...d.settings, icsFeed: { url, map, v: FEED_VERSION, lastSync: new Date().toISOString(), pending: [], lastError: "" } } }, r.stats, events, map);
    }),
    mapFeed: async (extra) => {
      const events = parseICS(await cloud.fetchIcs(dataRef.current.settings.icsFeed.url));
      return commitFeed((d) => {
        const { modules, map } = resolveNewModules(d, { ...d.settings.icsFeed.map, ...extra });
        const r = applyFeed({ ...d, modules }, events, map);
        return tumExams(d, { ...d, modules, sessions: r.sessions, notes: r.notes, settings: { ...d.settings, icsFeed: { ...d.settings.icsFeed, map, v: FEED_VERSION, pending: unmappedSummaries(events, map), lastSync: new Date().toISOString(), lastError: "" } } }, r.stats, events, map);
      });
    },
    syncFeed: (opts) => syncFeedRef.current(opts),
    subscribeMoodle: async (url, draftMap, events) => commitFeed((d) => {
      const { modules, map } = resolveNewModules(d, draftMap);
      const r = applyMoodle({ ...d, modules }, events, map, iso(), [], "moodle", url);
      return { stats: r.stats, next: { ...d, modules, homework: r.homework, settings: { ...d.settings, moodleFeed: { url, map, dismissed: [], lastSync: new Date().toISOString(), pending: [], lastError: "" } } } };
    }),
    mapMoodle: async (extra) => {
      const events = parseICS(await cloud.fetchIcs(dataRef.current.settings.moodleFeed.url));
      return commitFeed((d) => {
        const mf = d.settings.moodleFeed;
        const { modules, map } = resolveNewModules(d, { ...mf.map, ...extra });
        const r = applyMoodle({ ...d, modules }, events, map, iso(), mf.dismissed || [], "moodle", mf.url);
        return { stats: r.stats, next: { ...d, modules, homework: r.homework, settings: { ...d.settings, moodleFeed: { ...mf, map, pending: unmappedCourses(events, map), lastSync: new Date().toISOString(), lastError: "" } } } };
      });
    },
    syncMoodle: (opts) => syncMoodleRef.current(opts),
    subscribeArtemis: async (url, moduleId, events, label) => commitFeed((d) => {
      const feed = { id: uid(), url, moduleId, label, dismissed: [], lastSync: new Date().toISOString(), lastError: "" };
      const r = applyArtemis(d, feed, events);
      return withExams(d, { ...d, homework: r.homework, settings: { ...d.settings, artemisFeeds: [...(d.settings.artemisFeeds || []), feed] } }, r.stats, events, () => moduleId, `artemis:${feed.id}`);
    }),
    syncArtemis: (opts) => syncArtemisRef.current(opts),
    removeArtemis: (id) => change((d) => ({ ...d, settings: { ...d.settings, artemisFeeds: (d.settings.artemisFeeds || []).filter((f) => f.id !== id) } })),
    unsubscribeMoodle: () => change((d) => { const { moodleFeed, ...settings } = d.settings; void moodleFeed; return { ...d, settings }; }),
    unsubscribeFeed: () => change((d) => { const { icsFeed, ...settings } = d.settings; void icsFeed; return { ...d, settings }; }),
  };
}
