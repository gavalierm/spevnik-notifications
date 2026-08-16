// src/lib/notif.js — pure consumer of users.settings.notifications.
//
// Kontrakt bands[X]:
//   neexistuje      → user nie je related, žiadne notif
//   {} prázdny      → member, použi defaults
//   kľúče (subset)  → explicit override; missing event = "neaplikuje sa pre rolu"

// ACL aliases — server-internal event keys ktoré nie sú vystavené v SPA Settings
// dostávajú notif preferenciu z iného (alias) eventu. User toggle `band_create`
// = true → dostane aj album_create notifikácie.
const ACL_ALIASES = {
	album_create: 'band_create',
};

/**
 * Rozhodne, či má daný user dostať notifikáciu pre (bandId, event, channel).
 *
 * @param {object|null} notifications - users.settings.notifications JSON
 * @param {number|string} bandId
 * @param {string} event - jeden z EVENT_KEYS (môže byť server-only s ACL alias)
 * @param {string} channel - 'device' | 'email' (matches SPA events.js CHANNELS)
 * @returns {boolean}
 */
export function shouldNotify(notifications, bandId, event, channel) {
	if (!notifications) return false;
	const aclEvent = ACL_ALIASES[event] ?? event;
	const ovr = notifications.bands?.[String(bandId)];
	if (ovr === undefined) return false;
	if (ovr[aclEvent]?.[channel] !== undefined) return ovr[aclEvent][channel];
	if (Object.keys(ovr).length === 0) {
		return notifications.defaults?.[aclEvent]?.[channel] ?? false;
	}
	return false;
}

/**
 * Rozhodne, či sa daný event vôbec týka role usera v kapele — nezávisle od
 * kanálových preferencií. Kým shouldNotify() odpovedá na "chce to dostať
 * týmto kanálom?", táto funkcia odpovedá na "týka sa ho ten event vôbec?".
 *
 * Existuje pre in-app kanál: ten zámerne ignoruje kanálové preferencie (kto
 * má push aj email vypnutý, má mať badge fungujúci tiež — pozri shouldNotify
 * JSDoc/worker.js), ALE musí rešpektovať rolový rozsah. Public follower má v
 * SPA (spevnik/src/lib/notifications/events.js) k dispozícii len
 * FOLLOWER_EVENTS (setlist_create, song_create) — jeho seed override preto
 * obsahuje len tieto kľúče. Bez tejto kontroly by follower dostal in-app
 * kandidáta aj pre eventy mimo svojej roly (setlist_update,
 * setlist_attendance_*), o ktorých by ho inak žiadny kanál nikdy neinformoval.
 *
 * Kontrakt bands[X] (zdieľaný so shouldNotify): neexistuje → user nie je
 * related, false; {} prázdny → member s defaults, aplikuje sa na všetko,
 * true; kľúče (subset) → explicit override, missing event = "neaplikuje sa
 * pre rolu", false.
 *
 * Toggle jedného kanála v existujúcom evente kľúč z override neodstráni
 * (pozri spevnik/src/lib/notifications/NotifBandCard.svelte onChange) —
 * member, ktorý si vypol push aj email pre konkrétny event, má preň
 * isEventApplicable() naďalej true (badge počíta ďalej), len shouldNotify()
 * bude false pre oba kanály.
 *
 * @param {object|null} notifications - users.settings.notifications JSON
 * @param {number|string} bandId
 * @param {string} event - jeden z EVENT_KEYS (môže byť server-only s ACL alias)
 * @returns {boolean}
 */
export function isEventApplicable(notifications, bandId, event) {
	if (!notifications) return false;
	const aclEvent = ACL_ALIASES[event] ?? event;
	const ovr = notifications.bands?.[String(bandId)];
	if (ovr === undefined) return false;
	if (Object.keys(ovr).length === 0) return true;
	return aclEvent in ovr;
}
