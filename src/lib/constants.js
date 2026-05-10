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

// SPA event keys (mirror of spevnik/src/lib/notifications/events.js EVENT_KEYS).
// SYNC INVARIANT: keep in lockstep with SPA. Drift will be detected at extension
// load time by checking all writes hit known keys.
export const EVENT_KEYS = [
	'band_create',
	'setlist_create',
	'setlist_update',
	'setlist_attendance_invited',
	'setlist_attendance_responded',
	'song_create',
	'song_update',
];
