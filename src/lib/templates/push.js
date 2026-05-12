// src/lib/templates/push.js — krátke jednoradové notif body pre web push.

const BODIES = {
	band_create: (entity) => `Nové: ${entity.title}`,
	setlist_create: (entity) => `Nové: ${entity.title || 'bez názvu'}`,
	setlist_update: (entity) => `Aktualizované: ${entity.title || 'bez názvu'}`,
	setlist_attendance_invited: (entity) => `Pozvánka do setlistu: ${entity.title || 'bez názvu'}`,
	setlist_attendance_responded: (entity, ctx) => {
		const c = ctx?.confirmedCount ?? 0;
		const t = ctx?.totalCount ?? 0;
		return `Účasť v ${entity.title || 'setliste'}: potvrdených ${c}/${t}`;
	},
	song_create: (entity) => `Nové: ${entity.title || 'bez názvu'}`,
	song_update: (entity) => `Aktualizované: ${entity.title || 'bez názvu'}`,
};

/**
 * @param {string} eventKey
 * @param {object} band - { id, title }
 * @param {object} entity - entity row (title, etc.)
 * @param {object} [ctx] - extra context (e.g. confirmedCount for attendance)
 * @returns {{ title: string, body: string, url: string, icon: string, badge: string }}
 */
export function buildPushPayload(eventKey, band, entity, ctx) {
	return {
		title: band?.title ?? 'Spevník',
		body: BODIES[eventKey]?.(entity, ctx) ?? '',
		url: '/notifications',
		icon: '/img/fav/android-chrome-192x192.png',
		badge: '/img/fav/favicon-32x32.png',
	};
}
