// src/operations/worker.app.js — Directus admin UI metadata for the worker operation.
// Pre type=bundle entry typu operation je app strana povinná.

export default {
	id: 'spevnik-notifications-worker',
	name: 'Spevnik notifications worker',
	icon: 'notifications_active',
	description: 'Drain notification_events queue, dedup per recipient, send push + email',
	overview: () => [
		{ label: 'Cadence', text: '*/1 * * * *' },
		{ label: 'Dedup window', text: '30 min per (user, band, entity, channel)' },
		{ label: 'Batch limit', text: '500 events / run' },
	],
	options: [],
};
