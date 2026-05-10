// src/hooks/enqueue.js — action hook na watched collections.
//
// Lacný INSERT do notification_events. Žiadny resolve recipients, žiadny send.
// Hook je after-commit (action), takže entity_id je vždy známe.

import { COLLECTIONS_WATCHED } from '../lib/constants.js';
import { mapToEventKey, resolveBandId, resolveEntityRef } from '../lib/event-mapping.js';

async function enqueue(database, { eventKey, bandId, entityCollection, entityId, actorId, payload }) {
	if (!eventKey || bandId == null || entityId == null) return;
	await database('notification_events').insert({
		event_key: eventKey,
		band_id: bandId,
		entity_collection: entityCollection,
		entity_id: entityId,
		actor_id: actorId ?? null,
		payload: payload ? JSON.stringify(payload) : null,
		created_at: new Date().toISOString(),
		processed_at: null,
	});
}

export default ({ action }, { database, logger }) => {
	for (const col of COLLECTIONS_WATCHED) {
		action(`${col}.items.create`, async ({ key, payload, collection }, { accountability }) => {
			try {
				const eventKey = mapToEventKey(collection, 'create', payload);
				if (!eventKey) return;
				const bandId = await resolveBandId(database, collection, key, payload);
				if (!bandId) return;
				const entRef = await resolveEntityRef(database, collection, key);
				if (!entRef) return;
				await enqueue(database, {
					eventKey,
					bandId,
					entityCollection: entRef.entityCollection,
					entityId: entRef.entityId,
					actorId: accountability?.user,
					payload,
				});
			} catch (err) {
				logger.warn(`[notif-enqueue] ${col}.create failed: ${err.message}`);
			}
		});

		action(`${col}.items.update`, async ({ keys, payload, collection }, { accountability }) => {
			try {
				const eventKey = mapToEventKey(collection, 'update', payload);
				if (!eventKey) return;
				for (const id of keys) {
					const bandId = await resolveBandId(database, collection, id, payload);
					if (!bandId) continue;
					const entRef = await resolveEntityRef(database, collection, id);
					if (!entRef) continue;
					await enqueue(database, {
						eventKey,
						bandId,
						entityCollection: entRef.entityCollection,
						entityId: entRef.entityId,
						actorId: accountability?.user,
						payload,
					});
				}
			} catch (err) {
				logger.warn(`[notif-enqueue] ${col}.update failed: ${err.message}`);
			}
		});
	}
};
