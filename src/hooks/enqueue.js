// src/hooks/enqueue.js — action hook na watched collections.
//
// Lacný INSERT do notification_events. Žiadny resolve recipients, žiadny send.
// Hook je after-commit (action), takže entity_id je vždy známe.

import { COLLECTIONS_WATCHED, EVENT_KEYS } from '../lib/constants.js';
import { mapToEventKey, resolveContext } from '../lib/event-mapping.js';

const _eventKeysSet = new Set(EVENT_KEYS);

// Idempotent schema bootstrap — runs once at extension load.
// Indexes can't be created via Directus collections API; this is the only path
// to ensure they exist without external migration tooling. CREATE INDEX
// IF NOT EXISTS is no-op on subsequent loads, so it's safe to leave permanently.
let _schemaEnsured = false;
async function ensureSchema(database, logger) {
	if (_schemaEnsured) return;
	_schemaEnsured = true;
	const statements = [
		"CREATE INDEX IF NOT EXISTS idx_notif_events_unprocessed ON notification_events (created_at) WHERE processed_at IS NULL",
		"CREATE INDEX IF NOT EXISTS idx_notif_sent_dedup ON notification_sent_log (user_id, band_id, entity_collection, entity_id, channel, sent_at DESC)",
		"CREATE INDEX IF NOT EXISTS idx_directus_users_notifications_gin ON directus_users USING GIN ((settings::jsonb -> 'notifications' -> 'bands'))",
	];
	for (const sql of statements) {
		try {
			await database.raw(sql);
		} catch (err) {
			logger.warn(`[notif-ensureSchema] failed: ${err.message} sql=${sql.slice(0, 80)}`);
		}
	}
	logger.info('[notif-ensureSchema] notification indexes verified');
}

async function enqueue(database, logger, { eventKey, bandId, entityCollection, entityId, actorId, payload }) {
	if (!eventKey || bandId == null || entityId == null) return;
	if (!_eventKeysSet.has(eventKey)) {
		// Drift between SPA events.js EVENT_KEYS and extension constants.js EVENT_KEYS.
		// We still record the event (no data loss) but flag for ops attention.
		logger.warn(`[notif-enqueue] unknown event_key=${eventKey} — possible SPA↔extension drift, update constants.js EVENT_KEYS`);
	}
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
	// Fire-and-forget bootstrap — runs once on extension load.
	ensureSchema(database, logger).catch(err => {
		logger.warn(`[notif-ensureSchema] outer error: ${err.message}`);
	});

	for (const col of COLLECTIONS_WATCHED) {
		action(`${col}.items.create`, async ({ key, payload, collection }, { accountability }) => {
			try {
				const eventKey = mapToEventKey(collection, 'create', payload);
				if (!eventKey) return;
				const ctx = await resolveContext(database, collection, key, payload);
				if (!ctx || !ctx.bandId) return;
				await enqueue(database, logger, {
					eventKey,
					bandId: ctx.bandId,
					entityCollection: ctx.entityCollection,
					entityId: ctx.entityId,
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
					const ctx = await resolveContext(database, collection, id, payload);
					if (!ctx || !ctx.bandId) continue;
					await enqueue(database, logger, {
						eventKey,
						bandId: ctx.bandId,
						entityCollection: ctx.entityCollection,
						entityId: ctx.entityId,
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
