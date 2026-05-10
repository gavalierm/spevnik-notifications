// src/lib/notif.js — pure consumer of users.settings.notifications.
//
// Kontrakt bands[X]:
//   neexistuje      → user nie je related, žiadne notif
//   {} prázdny      → member, použi defaults
//   kľúče (subset)  → explicit override; missing event = "neaplikuje sa pre rolu"

/**
 * Rozhodne, či má daný user dostať notifikáciu pre (bandId, event, channel).
 *
 * @param {object|null} notifications - users.settings.notifications JSON
 * @param {number|string} bandId
 * @param {string} event - jeden z EVENT_KEYS
 * @param {string} channel - 'push' | 'email'
 * @returns {boolean}
 */
export function shouldNotify(notifications, bandId, event, channel) {
	if (!notifications) return false;
	const ovr = notifications.bands?.[String(bandId)];
	if (ovr === undefined) return false;
	if (ovr[event]?.[channel] !== undefined) return ovr[event][channel];
	if (Object.keys(ovr).length === 0) {
		return notifications.defaults?.[event]?.[channel] ?? false;
	}
	return false;
}
