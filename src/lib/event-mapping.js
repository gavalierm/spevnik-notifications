// src/lib/event-mapping.js — collection × operation → event_key.
//
// Setlist_participants má 2 distinct events (create=invited, update=responded)
// detected by payload.status presence.

/**
 * @param {string} collection
 * @param {'create'|'update'} op
 * @param {object} [payload] - body of the change request, used for setlist_participants disambiguation
 * @returns {string|null} event_key or null if no event applies
 */
export function mapToEventKey(collection, op, payload = null) {
	if (collection === 'songs') return op === 'create' ? 'song_create' : 'song_update';
	if (collection === 'setlists') return op === 'create' ? 'setlist_create' : 'setlist_update';
	if (collection === 'albums') return null;  // no album event in SPA model
	if (collection === 'setlist_participants') {
		if (op === 'create') return 'setlist_attendance_invited';
		if (op === 'update' && payload?.status && payload.status !== 'pending') return 'setlist_attendance_responded';
		return null;
	}
	return null;
}

/**
 * Resolve band_id for entity. Reads from payload first, falls back to DB lookup.
 *
 * @param {import('knex').Knex} database
 * @param {string} collection
 * @param {number|string} entityId
 * @param {object} [payload]
 * @returns {Promise<number|null>}
 */
export async function resolveBandId(database, collection, entityId, payload = null) {
	if (collection === 'songs' || collection === 'setlists' || collection === 'albums') {
		if (payload && payload.band !== undefined) return payload.band ?? null;
		const row = await database(collection).where('id', entityId).first('band');
		return row?.band ?? null;
	}
	if (collection === 'setlist_participants') {
		const row = await database('setlist_participants')
			.join('setlists', 'setlist_participants.setlist', 'setlists.id')
			.where('setlist_participants.id', entityId)
			.first('setlists.band as band', 'setlists.id as setlist_id');
		return row?.band ?? null;
	}
	return null;
}

/**
 * For setlist_participants events, the "entity" reported in notification_events
 * is the parent setlist (so all responses to one setlist share dedup row).
 *
 * Returns { entityCollection, entityId } given source row.
 */
export async function resolveEntityRef(database, collection, entityId) {
	if (collection === 'setlist_participants') {
		const row = await database('setlist_participants').where('id', entityId).first('setlist');
		return row ? { entityCollection: 'setlists', entityId: row.setlist } : null;
	}
	return { entityCollection: collection, entityId };
}
