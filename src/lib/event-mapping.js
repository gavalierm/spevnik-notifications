// src/lib/event-mapping.js — collection × operation → event_key.
//
// Setlist_participants má 2 distinct events (create=invited, update=responded);
// responded detekujeme na zmene payload.attendance_status (null=čaká, true/false=odpoveď).

/**
 * @param {string} collection
 * @param {'create'|'update'|'delete'} op
 * @param {object} [payload] - body of the change request, used for setlist_participants/setlists_songs disambiguation
 * @returns {string|null} event_key or null if no event applies
 */
export function mapToEventKey(collection, op, payload = null) {
	if (collection === 'songs') return op === 'create' ? 'song_create' : 'song_update';
	if (collection === 'setlists') {
		if (op === 'create') return 'setlist_create';
		// SPA po participant update PATCH-uje aj parent setlists/<id> (cache touch).
		// Tento cascade payload neobsahuje žiadny meaningful setlist field — len
		// {} alebo relational keys. Bez tohto checku by sa enqueue-oval phantom
		// setlist_update event ktorý v collapse vyhráva nad reálnym
		// setlist_attendance_responded (oba majú entity_collection='setlists',
		// entity_id=setlistId, takže worker step 2 zhodí skorší = attendance event).
		const SETLIST_MEANINGFUL = new Set(['title', 'date', 'time', 'status', 'notes', 'band', 'type', 'songs', 'files']);
		const hasMeaningful = payload && Object.keys(payload).some(k => SETLIST_MEANINGFUL.has(k));
		return hasMeaningful ? 'setlist_update' : null;
	}
	// Albums majú vlastné event_key 'album_create'. ACL je aliasovaný na band_create
	// v notif.js ACL_ALIASES — user nemá samostatný toggle v Settings, ale dostane
	// notifikáciu ak má zapnuté band_create. Update events sa neeventujú.
	if (collection === 'albums') return op === 'create' ? 'album_create' : null;
	if (collection === 'setlist_participants') {
		if (op === 'create') return 'setlist_attendance_invited';
		if (op === 'update' && payload && 'attendance_status' in payload && payload.attendance_status !== null) {
			return 'setlist_attendance_responded';
		}
		return null;
	}
	if (collection === 'setlists_songs') {
		// Adding/removing a song is always meaningful content change.
		if (op === 'create' || op === 'delete') return 'setlist_update';
		if (op === 'update') {
			// Reorder (drag-and-drop → updateSetlistSongOrder → batchUpdate) PATCHes
			// each junction row with a bare {sort} (Directus batch-array update may
			// echo the primary key back as {sort, id}) — cosmetic only, must not
			// notify. Any other key present (key_override, bpm_override, note,
			// songs_id, ...) is a real content change to the junction row. An empty
			// payload ({}) means no field changed at all — Array.every() on an empty
			// array is vacuously true, so it falls into the same "nothing meaningful
			// happened" bucket as a bare {sort}/{sort,id} and must not notify either.
			const REORDER_ONLY_KEYS = new Set(['sort', 'id']);
			const keys = payload ? Object.keys(payload) : [];
			const isReorderOnly = keys.every(k => REORDER_ONLY_KEYS.has(k));
			return isReorderOnly ? null : 'setlist_update';
		}
		return null;
	}
	return null;
}

/**
 * Resolve { bandId, entityCollection, entityId } for an entity in one DB roundtrip.
 *
 * For setlist_participants, the *reported* entity in notification_events is the
 * parent setlist (so all responses to one setlist share the dedup row). Both
 * the band lookup and the entity rewrite happen in a single JOIN query.
 *
 * @param {import('knex').Knex} database
 * @param {string} collection
 * @param {number|string} entityId
 * @param {object} [payload]
 * @returns {Promise<{ bandId: number|null, entityCollection: string, entityId: number|string } | null>}
 */
export async function resolveContext(database, collection, entityId, payload = null) {
	if (collection === 'songs' || collection === 'setlists' || collection === 'albums') {
		let bandId = null;
		if (payload && payload.band !== undefined) {
			// SDK can send M2O as a reference object ({ id: N }) instead of scalar id.
			// notification_events.band_id is an integer column — pass object and the
			// INSERT throws "invalid input syntax for type integer" in Postgres.
			const raw = payload.band;
			bandId = (raw && typeof raw === 'object') ? (raw.id ?? null) : (raw ?? null);
		} else {
			const row = await database(collection).where('id', entityId).first('band');
			bandId = row?.band ?? null;
		}
		return { bandId, entityCollection: collection, entityId };
	}
	if (collection === 'setlist_participants') {
		const row = await database('setlist_participants')
			.join('setlists', 'setlist_participants.setlists_id', 'setlists.id')
			.where('setlist_participants.id', entityId)
			.first('setlists.band as band', 'setlists.id as setlist_id');
		if (!row) return null;
		return { bandId: row.band ?? null, entityCollection: 'setlists', entityId: row.setlist_id };
	}
	if (collection === 'setlists_songs') {
		// Same rewrite as setlist_participants above: reported entity is the
		// parent setlist, so add/remove/override events on one setlist share
		// the same dedup row.
		const row = await database('setlists_songs')
			.join('setlists', 'setlists_songs.setlists_id', 'setlists.id')
			.where('setlists_songs.id', entityId)
			.first('setlists.band as band', 'setlists.id as setlist_id');
		if (!row) return null;
		return { bandId: row.band ?? null, entityCollection: 'setlists', entityId: row.setlist_id };
	}
	return null;
}
