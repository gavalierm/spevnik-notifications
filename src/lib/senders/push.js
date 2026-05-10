// src/lib/senders/push.js — web-push wrapper s 410/404 cleanup.

import webPush from 'web-push';
import { SEND_CONCURRENCY_PUSH } from '../constants.js';

// VAPID details are configured once per process. Mutating web-push global state
// on every batch send is wasteful (env vars don't change) and unsafe under
// horizontal scaling. The flag ensures setVapidDetails runs at most once.
let _vapidConfigured = false;
function ensureVapid(env, logger) {
	if (_vapidConfigured) return true;
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
		logger.error('[notif-worker] Missing VAPID env — skipping push batch');
		return false;
	}
	webPush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
	_vapidConfigured = true;
	return true;
}

/**
 * @param {Array<{
 *   user_id, band_id, entity_collection, entity_id,
 *   device: { id, endpoint, keys_p256dh, keys_auth },
 *   payload: object
 * }>} sendItems
 * @param {{ env: object, database: import('knex').Knex, logger: object }} ctx
 * @returns {Promise<{ delivered: typeof sendItems, expiredDeviceIds: number[] }>}
 */
export async function sendPushBatch(sendItems, { env, database, logger }) {
	if (!sendItems.length) return { delivered: [], expiredDeviceIds: [] };
	if (!ensureVapid(env, logger)) {
		return { delivered: [], expiredDeviceIds: [] };
	}

	const delivered = [];
	const expiredDeviceIds = new Set();

	// Run in concurrency-bounded batches.
	for (let i = 0; i < sendItems.length; i += SEND_CONCURRENCY_PUSH) {
		const slice = sendItems.slice(i, i + SEND_CONCURRENCY_PUSH);
		const results = await Promise.allSettled(slice.map(async (item) => {
			try {
				await webPush.sendNotification(
					{
						endpoint: item.device.endpoint,
						keys: { p256dh: item.device.keys_p256dh, auth: item.device.keys_auth },
					},
					JSON.stringify(item.payload)
				);
				return { item, status: 'sent' };
			} catch (err) {
				if (err.statusCode === 410 || err.statusCode === 404) {
					return { item, status: 'expired', deviceId: item.device.id };
				}
				logger.warn(`[notif-worker] push fail user=${item.user_id} dev=${item.device.id}: ${err.message}`);
				return { item, status: 'failed' };
			}
		}));

		for (const r of results) {
			const v = r.status === 'fulfilled' ? r.value : null;
			if (!v) continue;
			if (v.status === 'sent') delivered.push(v.item);
			else if (v.status === 'expired') expiredDeviceIds.add(v.deviceId);
		}
	}

	if (expiredDeviceIds.size) {
		await database('push_subscriptions').whereIn('id', [...expiredDeviceIds]).delete();
		logger.info(`[notif-worker] cleaned ${expiredDeviceIds.size} expired push_subscriptions`);
	}

	return { delivered, expiredDeviceIds: [...expiredDeviceIds] };
}
