// src/lib/senders/email.js — MailService wrapper s BCC optimalizáciou.
//
// Pre každý unique (subject + html) v batch-i: ak má >1 recipientov, jeden
// SMTP send s to=[primary] a bcc=[zvyšok]. Inak per-recipient send.

import { SEND_CONCURRENCY_EMAIL } from '../constants.js';

/**
 * @param {Array<{
 *   user_id, band_id, entity_collection, entity_id,
 *   email: string,
 *   payload: { subject: string, html: string }
 * }>} sendItems
 * @param {{ services, getSchema, logger }} ctx
 * @returns {Promise<{ delivered: typeof sendItems }>}
 */
export async function sendEmailBatch(sendItems, { services, getSchema, logger }) {
	if (!sendItems.length) return { delivered: [] };

	let schema;
	try {
		schema = await getSchema();
	} catch (err) {
		logger.error(`[notif-worker] getSchema failed for email send: ${err.message}`);
		return { delivered: [] };
	}
	const mailService = new services.MailService({ schema });

	// Group by identical (subject + html).
	const groups = new Map();
	for (const item of sendItems) {
		const key = item.payload.subject + '\x00' + item.payload.html;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(item);
	}

	const delivered = [];

	for (const items of groups.values()) {
		// One mail per group with BCC fan-out.
		const subject = items[0].payload.subject;
		const html = items[0].payload.html;
		const recipients = items.map(i => i.email).filter(Boolean);
		if (!recipients.length) continue;

		try {
			if (recipients.length === 1) {
				await mailService.send({ to: recipients[0], subject, html });
			} else {
				// Use first as `to` and rest as `bcc` to mask recipients from each other.
				await mailService.send({
					to: recipients[0],
					bcc: recipients.slice(1),
					subject,
					html,
				});
			}
			delivered.push(...items);
		} catch (err) {
			logger.warn(`[notif-worker] email batch fail (${recipients.length} recipients): ${err.message}`);
			// Fallback: try per-recipient with bounded concurrency.
			for (let i = 0; i < items.length; i += SEND_CONCURRENCY_EMAIL) {
				const slice = items.slice(i, i + SEND_CONCURRENCY_EMAIL);
				const results = await Promise.allSettled(slice.map(item =>
					mailService.send({ to: item.email, subject, html }).then(() => item)
				));
				for (const r of results) {
					if (r.status === 'fulfilled') delivered.push(r.value);
				}
			}
		}
	}

	return { delivered };
}
