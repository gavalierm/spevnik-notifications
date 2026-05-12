// src/lib/constants.js — single source of truth for tunables.

export const DEDUP_WINDOW_MIN = 30;
export const PRUNE_EVENTS_DAYS = 30;
export const PRUNE_SENT_LOG_MIN = 60;
export const WORKER_BATCH_LIMIT = 500;
export const SEND_CONCURRENCY_PUSH = 50;
export const SEND_CONCURRENCY_EMAIL = 20;
export const ADVISORY_LOCK_KEY = 8273918273;

export const COLLECTIONS_WATCHED = ['songs', 'setlists', 'albums', 'setlist_participants'];
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
