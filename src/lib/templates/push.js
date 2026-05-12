// src/lib/templates/push.js — push notification title + body.
//
// Title = generic (label + entity type), bez konkrétneho názvu. Lock-screen
//         riadok s title má dátum/čas pripojený, takže miesto je obmedzené.
// Body  = concrete info na začiatku (entity title → band title), žiadne
//         label-y typu "Kapela:" — tie posúvajú hodnotu za truncate.

const TITLES = {
	band_create: () => `Nová kapela`,
	album_create: () => `Nový album`,
	setlist_create: () => `Nový setlist`,
	setlist_update: () => `Úprava setlistu`,
	setlist_attendance_invited: () => `Pozvánka`,
	setlist_attendance_responded: () => `Úprava účasti`,
	song_create: () => `Nová pieseň`,
	song_update: () => `Úprava piesne`,
};

const BODIES = {
	// band_create: entity IS the new band. Žiadny parent band.
	band_create: (entity) => `${entity.title} · Privítajte ich v Spevníku!`,
	album_create: (entity, band) => `${entity.title} · ${band?.title || ''}`,
	setlist_create: (entity, band) => `${entity.title || 'bez názvu'} · ${band?.title || ''}`,
	setlist_update: (entity, band) => `${entity.title || 'bez názvu'} · ${band?.title || ''}`,
	setlist_attendance_invited: (entity, band) => `${entity.title || 'bez názvu'} · ${band?.title || ''}`,
	// Responded: counts sú reálna update info → na začiatok pred truncate.
	setlist_attendance_responded: (entity, band, ctx) => {
		const c = ctx?.confirmedCount ?? 0;
		const t = ctx?.totalCount ?? 0;
		return `${c}/${t} potvrdených · ${entity.title || 'bez názvu'} · ${band?.title || ''}`;
	},
	song_create: (entity, band) => `${entity.title || 'bez názvu'} · ${band?.title || ''}`,
	song_update: (entity, band) => `${entity.title || 'bez názvu'} · ${band?.title || ''}`,
};

/**
 * @param {string} eventKey
 * @param {object} band - { id, title }
 * @param {object} entity - entity row (title, etc.)
 * @param {object} [ctx] - extra context (entityCollection, confirmedCount/totalCount)
 * @returns {{ title: string, body: string, url: string, icon: string, badge: string }}
 */
export function buildPushPayload(eventKey, band, entity, ctx) {
	return {
		title: TITLES[eventKey]?.(entity, ctx) ?? band?.title ?? 'Spevník',
		body: BODIES[eventKey]?.(entity, band, ctx) ?? '',
		url: '/notifications',
		icon: '/img/fav/android-chrome-192x192.png',
		badge: '/img/fav/favicon-32x32.png',
	};
}
