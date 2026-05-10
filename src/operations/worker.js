// src/operations/worker.js — drain queue, dedup, send, log.
// API handler for the operation entry. UI metadata lives in worker.app.js.

import { acquireLock, releaseLock } from '../lib/lock.js';
import { loadRecipientsForBand } from '../lib/recipients.js';
import { filterByDedup, writeSentLog } from '../lib/dedup.js';
import { shouldNotify } from '../lib/notif.js';
import { sendPushBatch } from '../lib/senders/push.js';
import { sendEmailBatch } from '../lib/senders/email.js';
import { buildPushPayload } from '../lib/templates/push.js';
import { buildEmailPayload } from '../lib/templates/email.js';
import { pruneOldEvents, pruneOldSentLog } from '../lib/prune.js';
import { WORKER_BATCH_LIMIT, CHANNELS } from '../lib/constants.js';

export default {
	id: 'spevnik-notifications-worker',
	handler: async (_opts, ctx) => {
		const { database, logger, services, getSchema, env } = ctx;

		const got = await acquireLock(database);
		if (!got) {
			logger.info('[notif-worker] previous run still active, skipping');
			return { skipped: true };
		}

		try {
			// 1. Drain queue
			const events = await database('notification_events')
				.whereNull('processed_at')
				.orderBy('created_at', 'asc')
				.limit(WORKER_BATCH_LIMIT)
				.select('*');

			if (!events.length) {
				await pruneOldEvents(database);
				await pruneOldSentLog(database);
				return { processed: 0 };
			}

			// 2. Collapse duplicates: keep latest event per (band, entity_collection, entity_id).
			const latestByKey = new Map();
			for (const ev of events) {
				const k = `${ev.band_id}|${ev.entity_collection}|${ev.entity_id}`;
				const prev = latestByKey.get(k);
				if (!prev || new Date(ev.created_at).getTime() > new Date(prev.created_at).getTime()) {
					latestByKey.set(k, ev);
				}
			}
			const keep = [...latestByKey.values()];
			const allEventIds = events.map(e => e.id);

			// 3. Per-band recipient resolution + content building
			const candidates = [];                    // pre dedup
			const bandsCache = new Map();              // bandId → row
			const entitiesCache = new Map();           // `${collection}|${id}` → row

			for (const ev of keep) {
				// Lazy load band
				let band = bandsCache.get(ev.band_id);
				if (!band) {
					band = await database('bands').where('id', ev.band_id).first('id', 'title');
					if (!band) continue;
					bandsCache.set(ev.band_id, band);
				}

				// Lazy load entity
				const entKey = `${ev.entity_collection}|${ev.entity_id}`;
				let entity = entitiesCache.get(entKey);
				if (!entity) {
					entity = await database(ev.entity_collection).where('id', ev.entity_id).first('id', 'title').catch(() => null);
					if (!entity) entity = { id: ev.entity_id, title: '' };
					entitiesCache.set(entKey, entity);
				}

				// For attendance_responded, fetch current confirmed/total
				let extraCtx = null;
				if (ev.event_key === 'setlist_attendance_responded') {
					const counts = await database('setlist_participants')
						.where('setlist', ev.entity_id)
						.select(database.raw(`
							COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
							COUNT(*)::int AS total
						`))
						.first();
					extraCtx = { confirmedCount: counts?.confirmed ?? 0, totalCount: counts?.total ?? 0 };
				}

				// Recipients for this band
				const recipients = await loadRecipientsForBand(database, ev.band_id);

				for (const r of recipients) {
					for (const channel of CHANNELS) {
						// SPA channel naming: 'device' (push), 'email' (email).
						// Extension internal: 'push' / 'email'. Conversion at consumer call.
						const spaChannel = channel === 'email' ? 'email' : 'device';
						if (!shouldNotify(r.notifications, ev.band_id, ev.event_key, spaChannel)) continue;
						if (channel === 'push' && r.devices.length === 0) continue;
						if (channel === 'email' && !r.email) continue;

						// Build per-channel send items
						if (channel === 'push') {
							const payload = buildPushPayload(ev.event_key, band, entity, extraCtx);
							for (const dev of r.devices) {
								candidates.push({
									user_id: r.id,
									band_id: ev.band_id,
									entity_collection: ev.entity_collection,
									entity_id: ev.entity_id,
									channel: 'push',
									_send: { device: dev, payload },
								});
							}
						} else {
							const payload = buildEmailPayload(ev.event_key, band, entity, extraCtx);
							candidates.push({
								user_id: r.id,
								band_id: ev.band_id,
								entity_collection: ev.entity_collection,
								entity_id: ev.entity_id,
								channel: 'email',
								_send: { email: r.email, payload },
							});
						}
					}
				}
			}

			// 4. Dedup
			// Note: dedup key is (user, band, entity, channel) — multiple devices for same user
			// share dedup. Only first device send writes log; remaining device sends in same
			// candidate set are dropped at sendPlan time after writeSentLog.
			const passedDedup = await filterByDedup(database, candidates.map(c => ({
				user_id: c.user_id, band_id: c.band_id,
				entity_collection: c.entity_collection, entity_id: c.entity_id,
				channel: c.channel,
			})));

			// Re-attach _send by index (filterByDedup preserves order, but to be safe re-key):
			const passedKeys = new Set(passedDedup.map(p => `${p.user_id}|${p.band_id}|${p.entity_collection}|${p.entity_id}|${p.channel}`));
			const sendable = candidates.filter(c =>
				passedKeys.has(`${c.user_id}|${c.band_id}|${c.entity_collection}|${c.entity_id}|${c.channel}`)
			);

			// Within sendable: collapse multiple-devices-per-user-per-channel for dedup write.
			// (Send all device push notifications, but write ONE log row per user×channel.)
			const seenLogKeys = new Set();
			const logEntries = [];
			for (const s of sendable) {
				const k = `${s.user_id}|${s.band_id}|${s.entity_collection}|${s.entity_id}|${s.channel}`;
				if (seenLogKeys.has(k)) continue;
				seenLogKeys.add(k);
				logEntries.push({
					user_id: s.user_id, band_id: s.band_id,
					entity_collection: s.entity_collection, entity_id: s.entity_id,
					channel: s.channel,
				});
			}

			// 5. Send
			const pushItems = sendable.filter(s => s.channel === 'push').map(s => ({
				user_id: s.user_id, band_id: s.band_id,
				entity_collection: s.entity_collection, entity_id: s.entity_id,
				device: s._send.device, payload: s._send.payload,
			}));
			const emailItems = sendable.filter(s => s.channel === 'email').map(s => ({
				user_id: s.user_id, band_id: s.band_id,
				entity_collection: s.entity_collection, entity_id: s.entity_id,
				email: s._send.email, payload: s._send.payload,
			}));

			const pushResult = await sendPushBatch(pushItems, { env, database, logger });
			const emailResult = await sendEmailBatch(emailItems, { services, getSchema, logger });

			// 6. Write sent_log only for users who had at least one delivered send per channel.
			const deliveredUserKeys = new Set();
			for (const d of [...pushResult.delivered, ...emailResult.delivered]) {
				deliveredUserKeys.add(`${d.user_id}|${d.band_id}|${d.entity_collection}|${d.entity_id}|${d.channel}`);
			}
			const finalLog = logEntries.filter(l =>
				deliveredUserKeys.has(`${l.user_id}|${l.band_id}|${l.entity_collection}|${l.entity_id}|${l.channel}`)
			);
			await writeSentLog(database, finalLog);

			// 7. Mark all queue events processed (both kept and absorbed-by-collapse)
			await database('notification_events')
				.whereIn('id', allEventIds)
				.update({ processed_at: new Date().toISOString() });

			// 8. Prune
			await pruneOldEvents(database);
			await pruneOldSentLog(database);

			logger.info(`[notif-worker] processed=${events.length} kept=${keep.length} push_sent=${pushResult.delivered.length} email_sent=${emailResult.delivered.length} expired=${pushResult.expiredDeviceIds.length}`);

			return {
				processed: events.length,
				collapsed: events.length - keep.length,
				push_sent: pushResult.delivered.length,
				email_sent: emailResult.delivered.length,
				expired_devices: pushResult.expiredDeviceIds.length,
			};
		} catch (err) {
			logger.error(`[notif-worker] fatal: ${err.message}`, err);
			return { error: err.message };
		} finally {
			await releaseLock(database);
		}
	},
};
