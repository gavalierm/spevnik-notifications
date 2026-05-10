// src/lib/prune.js — TTL cleanup pre obe queue tabuľky.
// Worker volá pri každom behu (lacné, indexed delete).

import { PRUNE_EVENTS_DAYS, PRUNE_SENT_LOG_MIN } from './constants.js';

export async function pruneOldEvents(database) {
	const cutoff = new Date(Date.now() - PRUNE_EVENTS_DAYS * 24 * 60 * 60 * 1000).toISOString();
	const deleted = await database('notification_events')
		.whereNotNull('processed_at')
		.where('created_at', '<', cutoff)
		.delete();
	return deleted;
}

export async function pruneOldSentLog(database) {
	const cutoff = new Date(Date.now() - PRUNE_SENT_LOG_MIN * 60 * 1000).toISOString();
	const deleted = await database('notification_sent_log')
		.where('sent_at', '<', cutoff)
		.delete();
	return deleted;
}
