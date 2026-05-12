// src/lib/templates/push.js — push notification title + body.
//
// Title = krátka headline (label + entity title alebo aggregát).
// Body  = kontext (entity type + kapela) — to čo by sa stratilo, keby user
//         videl iba title (napr. "Nové: Greatest Hits" bez info, že je to album
//         v kapele X).

const TITLES = {
	band_create: (entity) => `Nové: ${entity.title}`,
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

const BODIES = {
	// Pure band_create (bez emitter-a) → "Nová kapela v Spevníku".
	// Album-driven piggyback (ctx.entityCollection === 'albums') → entity type Album + parent kapela.
	band_create: (entity, band, ctx) => ctx?.entityCollection === 'albums'
		? `Album · Kapela: ${band?.title || ''}`
		: `Nová kapela v Spevníku`,
	setlist_create: (entity, band) => `Setlist · Kapela: ${band?.title || ''}`,
	setlist_update: (entity, band) => `Setlist · Kapela: ${band?.title || ''}`,
	// Invited title už nesie setlist názov; body len kapela.
	setlist_attendance_invited: (entity, band) => `Kapela: ${band?.title || ''}`,
	// Responded title nesie len pomer X/Y — body musí dodať setlist názov + kapelu.
	setlist_attendance_responded: (entity, band) => `${entity.title || 'bez názvu'} · Kapela: ${band?.title || ''}`,
	song_create: (entity, band) => `Pieseň · Kapela: ${band?.title || ''}`,
	song_update: (entity, band) => `Pieseň · Kapela: ${band?.title || ''}`,
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
