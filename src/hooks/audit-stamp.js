// src/hooks/audit-stamp.js — stamp parent setlist audit fields on junction writes.
//
// Directus date-updated / user-updated special hooks fire only on a direct PATCH
// of the setlists row. Junction writes (setlists_songs, setlist_participants) leave
// them frozen, so the "Upravil" UI block goes stale after content changes.
//
// The SPA used to work around this with touchSetlist() — re-writing `title` with its
// current value purely to trigger setlists.items.update. That produced a phantom
// setlist_update notification event which outranked the real setlist_create in worker
// collapse (304 of 338 setlist_update events had a payload identical to the stored
// value). Stamping server-side removes both the workaround and the phantom.
//
// Raw Knex bypasses ItemsService, so these updates emit no Directus events — no
// notification enqueue, no recursion, no revision noise. The trade-off is that the
// special hooks don't run either, so both columns are set explicitly here.
//
// Delete uses a `filter` hook, not `action`: the delete action meta carries only
// `keys` and no item fields, so the parent setlist id is unknowable once the row is
// gone. The filter runs pre-delete, where the row still resolves. If the delete then
// fails, the stamp stays — acceptable for an informational audit timestamp.

const JUNCTION_PARENT_FIELD = {
	setlists_songs: 'setlists_id',
	setlist_participants: 'setlists_id',
};

async function stampParents(database, logger, collection, parentField, ids, actorId) {
	if (!ids.length) return;
	const rows = await database(collection).whereIn('id', ids).select(parentField);
	const setlistIds = [...new Set(rows.map(r => r[parentField]).filter(v => v != null))];
	if (!setlistIds.length) return;
	await database('setlists').whereIn('id', setlistIds).update({
		date_updated: new Date().toISOString(),
		user_updated: actorId ?? null,
	});
	logger.info(`[notif-audit-stamp] ${collection} → stamped setlists ${setlistIds.join(',')}`);
}

export default ({ action, filter }, { database, logger }) => {
	for (const [collection, parentField] of Object.entries(JUNCTION_PARENT_FIELD)) {
		action(`${collection}.items.create`, async ({ key }, { accountability }) => {
			try {
				await stampParents(database, logger, collection, parentField, [key], accountability?.user);
			} catch (err) {
				logger.warn(`[notif-audit-stamp] ${collection}.create failed: ${err.message}`);
			}
		});

		action(`${collection}.items.update`, async ({ keys }, { accountability }) => {
			try {
				await stampParents(database, logger, collection, parentField, keys ?? [], accountability?.user);
			} catch (err) {
				logger.warn(`[notif-audit-stamp] ${collection}.update failed: ${err.message}`);
			}
		});

		// Pre-delete: the row must still exist to resolve its parent setlist.
		filter(`${collection}.items.delete`, async (keys, _meta, { accountability }) => {
			try {
				await stampParents(database, logger, collection, parentField, keys ?? [], accountability?.user);
			} catch (err) {
				logger.warn(`[notif-audit-stamp] ${collection}.delete failed: ${err.message}`);
			}
			return keys;
		});
	}
};
