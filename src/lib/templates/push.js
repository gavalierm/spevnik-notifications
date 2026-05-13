// src/lib/templates/push.js — push notification title + body.
//
// Title = generic (label + entity type), bez konkrétneho názvu. Lock-screen
//         riadok s title má dátum/čas pripojený, takže miesto je obmedzené.
// Body  = concrete info na začiatku (entity title → band title), žiadne
//         label-y typu "Kapela:" — tie posúvajú hodnotu za truncate.

// Slovak compact date: D.M.YYYY (bez padding, bez spaces).
function fmtDate(d) {
	if (!d) return '';
	const dt = d instanceof Date ? d : new Date(d);
	if (isNaN(dt.getTime())) return '';
	return `${dt.getDate()}.${dt.getMonth() + 1}.${dt.getFullYear()}`;
}

// Setlist body skeleton: title · date · band — všetky segmenty conditional aby
// sa neukazovali prázdne dot-separator-y pri chýbajúcich field-och.
function setlistBody(entity, band) {
	const parts = [entity.title || 'bez názvu'];
	const d = fmtDate(entity.date);
	if (d) parts.push(d);
	if (band?.title) parts.push(band.title);
	return parts.join(' · ');
}

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
	setlist_create: setlistBody,
	setlist_update: setlistBody,
	setlist_attendance_invited: setlistBody,
	// Responded: counts sú reálna update info → na začiatok pred truncate.
	// Formát +X/-Y z Z konzistentný s email subject-om (signed math notation).
	setlist_attendance_responded: (entity, band, ctx) => {
		const c = ctx?.confirmedCount ?? 0;
		const d = ctx?.declinedCount ?? 0;
		const t = ctx?.totalCount ?? 0;
		return `+${c}/-${d} z ${t} · ${setlistBody(entity, band)}`;
	},
	song_create: (entity, band) => `${entity.title || 'bez názvu'} · ${band?.title || ''}`,
	song_update: (entity, band) => `${entity.title || 'bez názvu'} · ${band?.title || ''}`,
};

// Entity-specific deep link (SPA relative path). Service worker po kliknutí
// otvorí túto cestu v rámci aplikácie. Žiadny base URL — SPA si ho domyslí.
function entityUrl(entity, ctx) {
	const col = ctx?.entityCollection;
	if (col === 'songs') return `/library/${entity.id}`;
	if (col === 'setlists') return `/setlists/${entity.id}`;
	if (col === 'albums') return `/explore/albums/${entity.id}`;
	if (col === 'bands') return `/explore/bands/${entity.id}`;
	return '/notifications';
}

/**
 * @param {string} eventKey
 * @param {object} band - { id, title }
 * @param {object} entity - entity row (title, date, ...)
 * @param {object} [ctx] - extra context (entityCollection, confirmedCount/totalCount)
 * @returns {{ title: string, body: string, url: string, icon: string, badge: string }}
 */
export function buildPushPayload(eventKey, band, entity, ctx) {
	return {
		title: TITLES[eventKey]?.(entity, ctx) ?? band?.title ?? 'Spevník',
		body: BODIES[eventKey]?.(entity, band, ctx) ?? '',
		url: entityUrl(entity, ctx),
		icon: '/img/fav/android-chrome-192x192.png',
		badge: '/img/fav/favicon-32x32.png',
	};
}
