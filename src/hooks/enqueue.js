// src/hooks/enqueue.js — action hook na watched collections.
//
// Lacný INSERT do notification_events. Žiadny resolve recipients, žiadny send.
// Hook je after-commit (action), takže entity_id je vždy známe.

import { COLLECTIONS_WATCHED, EVENT_KEYS } from '../lib/constants.js';
import { mapToEventKey, resolveContext } from '../lib/event-mapping.js';
import { notifyAdmins } from '../shared/notify-admin.js';

const _eventKeysSet = new Set(EVENT_KEYS);

// Junction collections whose row deletion can itself be the meaningful event
// (removing a song / a participant from a setlist). Deleting the parent
// entity (a song, a setlist, an album) is out of scope here — that's why this
// is a small explicit list, not COLLECTIONS_WATCHED. Duplicates the key set
// of audit-stamp.js's JUNCTION_PARENT_FIELD; not imported from there because
// audit-stamp.js doesn't export it and is out of scope for this change.
const JUNCTION_COLLECTIONS = ['setlists_songs', 'setlist_participants'];

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
		// idx_notif_sent_dedup_class: dedup kľúč vrátane event_class. Dedup query
		// (lib/dedup.js filterByDedup) filtruje cez všetkých 6 stĺpcov, takže toto
		// je jediný index, ktorý daný dotaz obsluhuje.
		"CREATE INDEX IF NOT EXISTS idx_notif_sent_dedup_class ON notification_sent_log (user_id, band_id, entity_collection, entity_id, event_class, channel, sent_at DESC)",
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

export default ({ action, filter }, context) => {
	const { database, logger } = context;
	const notifyCtx = { services: context.services, database, getSchema: context.getSchema, logger, env: context.env };
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
				await notifyAdmins(notifyCtx, `spevnik-notifications:enqueue:${col}.create`, err, {
					collection, key, actor: accountability?.user,
				});
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
				await notifyAdmins(notifyCtx, `spevnik-notifications:enqueue:${col}.update`, err, {
					collection, keys, actor: accountability?.user,
				});
			}
		});
	}

	// Delete uses a `filter` hook, not `action`: the delete action meta carries
	// only `keys` and no item fields, so the parent setlist id is unknowable
	// once the row is gone. The filter runs pre-delete, where the row still
	// resolves (same reasoning as audit-stamp.js's delete handling).
	//
	// Trade-off: enqueue happens before the delete commits, so a delete that
	// fails afterward still leaves the event enqueued. Risk is low (deleting a
	// junction row is a trivial operation) and audit-stamp.js already accepts
	// the same trade-off for its audit stamp.
	for (const col of JUNCTION_COLLECTIONS) {
		filter(`${col}.items.delete`, async (keys, _meta, { accountability }) => {
			try {
				const eventKey = mapToEventKey(col, 'delete');
				if (eventKey) {
					for (const id of keys ?? []) {
						const ctx = await resolveContext(database, col, id);
						if (!ctx || !ctx.bandId) continue;
						await enqueue(database, logger, {
							eventKey,
							bandId: ctx.bandId,
							entityCollection: ctx.entityCollection,
							entityId: ctx.entityId,
							actorId: accountability?.user,
							payload: null,
						});
					}
				}
			} catch (err) {
				logger.warn(`[notif-enqueue] ${col}.delete failed: ${err.message}`);
				await notifyAdmins(notifyCtx, `spevnik-notifications:enqueue:${col}.delete`, err, {
					collection: col, keys, actor: accountability?.user,
				});
			}
			return keys;
		});
	}
};
