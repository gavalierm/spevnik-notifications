// src/lib/constants.js — single source of truth for tunables.

export const DEDUP_WINDOW_MIN = 30;
export const PRUNE_EVENTS_DAYS = 30;
// Retencia sent_log. NEZÁVISLÁ od DEDUP_WINDOW_MIN — dedup pozerá výhradne na
// riadky s sent_at > NOW() - DEDUP_WINDOW_MIN (dedup.js), takže staršie riadky
// neblokujú nič bez ohľadu na to, ako dlho tu ležia.
// 7 dní: okno pre in-app badge aj pre notifikačný žurnál v SPA (zobrazuje
// posledných 30 položiek). Kratšie okno = menší delivery log pre diagnostiku,
// vedomý kompromis operátora 2026-08-16.
export const PRUNE_SENT_LOG_MIN = 10080;
export const WORKER_BATCH_LIMIT = 500;
export const SEND_CONCURRENCY_PUSH = 50;
export const SEND_CONCURRENCY_EMAIL = 20;
export const ADVISORY_LOCK_KEY = 8273918273;

export const COLLECTIONS_WATCHED = ['songs', 'setlists', 'albums', 'setlist_participants', 'setlists_songs'];
export const CHANNELS = ['push', 'email'];

// In-app kanál — NIE je v CHANNELS zámerne. CHANNELS je pole, cez ktoré worker
// iteruje pri stavaní odosielacích kandidátov (shouldNotify → device/email check →
// _send payload). 'inapp' neprechádza ani jedným z tých krokov: nič neodosiela,
// ignoruje per-kanálové preferencie a vzniká pre každého príjemcu, ktorý prejde
// ACL. Žije mimo tej slučky (worker.js krok 3).
//
// SYNC INVARIANT: keep in lockstep s lokálnou konštantou INAPP_CHANNEL v
// spevnik/src/lib/api/queries/notifications.js (samostatné repo). Drift je
// tichý — žiadna chyba, žiadny warning: SPA query filtruje na reťazec, ktorý
// tento worker nikdy nezapíše, a badge natrvalo ukazuje 0.
export const INAPP_CHANNEL = 'inapp';

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
