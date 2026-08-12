// src/lib/constants.js — single source of truth for tunables.

export const DEDUP_WINDOW_MIN = 30;
export const PRUNE_EVENTS_DAYS = 30;
export const PRUNE_SENT_LOG_MIN = 60;
export const WORKER_BATCH_LIMIT = 500;
export const SEND_CONCURRENCY_PUSH = 50;
export const SEND_CONCURRENCY_EMAIL = 20;
export const ADVISORY_LOCK_KEY = 8273918273;

export const COLLECTIONS_WATCHED = ['songs', 'setlists', 'albums', 'setlist_participants', 'setlists_songs'];
export const CHANNELS = ['push', 'email'];

// Event keys recognized by extension.
// - SPA keys (mirror of spevnik/src/lib/notifications/events.js EVENT_KEYS) —
//   SYNC INVARIANT: keep in lockstep. Drift surfaces as a [notif-enqueue]
//   "unknown event_key=..." warning v Directus logoch.
// - Server-side internals (album_create) — NIE sú v SPA EVENT_KEYS; ACL je
//   aliasovaný cez notif.js ACL_ALIASES (album_create → band_create).
export const EVENT_KEYS = [
	'band_create',
	'album_create',
	'setlist_create',
	'setlist_update',
	'setlist_attendance_invited',
	'setlist_attendance_responded',
	'song_create',
	'song_update',
];

// Event classification — used by BOTH collapse (worker.js krok 2, per-batch) a
// dedup (worker.js krok 4 + dedup.js, 30-min okno naprieč behmi). Musia zdieľať
// presne tento istý výpočet, inak sa vrstvy rozídu: napr. "Nový setlist" (content)
// by mohol dedup-om umlčať nasledujúcu "Pozvánku" (attendance), hoci ide o
// sémanticky odlišné správy pre (potenciálne) rôznych ľudí. Pozri "Dedup contract"
// v docs/superpowers/specs/2026-05-10-notifications-extension-design.md.
export const EVENT_CLASS = {
	setlist_create: 'content',
	setlist_update: 'content',
	song_create: 'content',
	song_update: 'content',
	album_create: 'content',
	band_create: 'content',
	setlist_attendance_invited: 'attendance',
	setlist_attendance_responded: 'attendance',
};

export function classifyEvent(eventKey) {
	return EVENT_CLASS[eventKey] ?? 'content';
}
