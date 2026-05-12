// src/lib/templates/push.js — push notification title + body.
//
// Title = krátka headline (label + entity title alebo aggregát).
// Body  = kontext (entity type + kapela) — to čo by sa stratilo, keby user
//         videl iba title (napr. "Nové: Greatest Hits" bez info, že je to album
//         v kapele X).

const TITLES = {
	band_create: (entity) => `Nové: ${entity.title}`,
	album_create: (entity) => `Nové: ${entity.title}`,
	setlist_create: (entity) => `Nové: ${entity.title || 'bez názvu'}`,
	setlist_update: (entity) => `Aktualizované: ${entity.title || 'bez názvu'}`,
	setlist_attendance_invited: (entity) => `Pozvánka: ${entity.title || 'bez názvu'}`,
	setlist_attendance_responded: (entity, ctx) => {
		const c = ctx?.confirmedCount ?? 0;
		const t = ctx?.totalCount ?? 0;
		return `Účasť: Potvrdených ${c}/${t}`;
	},
	song_create: (entity) => `Nové: ${entity.title || 'bez názvu'}`,
	song_update: (entity) => `Aktualizované: ${entity.title || 'bez názvu'}`,
};

// Push body sa na lock-screen-e truncuje od konca — concrete info (názov kapely
// / setlistu) MUSÍ byť na začiatku. Žiadne generic label-y ("Setlist:", "Kapela:")
// ako prefix — tie posúvajú reálnu hodnotu za truncate.
const BODIES = {
	band_create: () => `Spevník`,
	album_create: (entity, band) => band?.title || '',
	setlist_create: (entity, band) => band?.title || '',
	setlist_update: (entity, band) => band?.title || '',
	// Invited title nesie setlist názov, body kapelu.
	setlist_attendance_invited: (entity, band) => band?.title || '',
	// Responded title má len pomer X/Y — body dodá setlist názov prvý (concrete
	// identifier čo je akcia o), kapela ako secondary kontext.
	setlist_attendance_responded: (entity, band) =>
		`${entity.title || 'bez názvu'} · ${band?.title || ''}`,
	song_create: (entity, band) => band?.title || '',
	song_update: (entity, band) => band?.title || '',
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
