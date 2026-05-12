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
