// src/lib/dedup.js — sent_log dedup query + write helpers.

import { DEDUP_WINDOW_MIN } from './constants.js';

/**
 * Bulk dedup check: pre množinu kandidátov vráti len tých ktorí PRESHLI dedup
 * (žiadny sent_log entry pre (user, band, entity, channel) v posledných 30 min).
 *
 * Implementation: composite IN list cez Postgres VALUES + JOIN, plne parametrizované
 * (žiadne string-interpolated SQL). Index idx_notif_sent_dedup pokrýva lookup.
 *
 * @param {import('knex').Knex} database
 * @param {Array<{user_id, band_id, entity_collection, entity_id, channel}>} candidates
 * @returns {Promise<typeof candidates>}
 */
export async function filterByDedup(database, candidates) {
	if (!candidates.length) return [];

	const cutoff = new Date(Date.now() - DEDUP_WINDOW_MIN * 60 * 1000).toISOString();

	// Build VALUES clause with placeholders only (5 placeholders per row).
	const placeholders = candidates.map(() => '(?::uuid, ?::int, ?::text, ?::int, ?::text)').join(',');
	const bindings = [];
	for (const c of candidates) {
		bindings.push(c.user_id, c.band_id, c.entity_collection, c.entity_id, c.channel);
	}

	const sql = `
		WITH input(user_id, band_id, entity_collection, entity_id, channel) AS (
			VALUES ${placeholders}
		)
		SELECT i.user_id, i.band_id, i.entity_collection, i.entity_id, i.channel
		FROM input i
		JOIN notification_sent_log s ON
			s.user_id = i.user_id
			AND s.band_id = i.band_id
			AND s.entity_collection = i.entity_collection
			AND s.entity_id = i.entity_id
			AND s.channel = i.channel
		WHERE s.sent_at > ?
	`;
	bindings.push(cutoff);

	const blocked = await database.raw(sql, bindings);

	const blockedSet = new Set(
		blocked.rows.map(r => `${r.user_id}|${r.band_id}|${r.entity_collection}|${r.entity_id}|${r.channel}`)
	);

	return candidates.filter(c =>
		!blockedSet.has(`${c.user_id}|${c.band_id}|${c.entity_collection}|${c.entity_id}|${c.channel}`)
	);
}

/**
 * Bulk INSERT do sent_log po úspešnom send-e.
 *
 * @param {import('knex').Knex} database
 * @param {Array<{user_id, band_id, entity_collection, entity_id, channel}>} delivered
 */
export async function writeSentLog(database, delivered) {
	if (!delivered.length) return;
	const now = new Date().toISOString();
	const rows = delivered.map(d => ({
		user_id: d.user_id,
		band_id: d.band_id,
		entity_collection: d.entity_collection,
		entity_id: d.entity_id,
		channel: d.channel,
		sent_at: now,
	}));
	// Knex chunks by default; explicit chunk if dataset large.
	await database('notification_sent_log').insert(rows);
}
