// src/lib/recipients.js — bulk resolve users + devices for a band.
//
// Single jsonb query: vráti všetkých users related k bandu (cez settings.notifications.bands)
// + ich push_subscriptions joinom. Žiadny round-trip per recipient.
//
// Note: Postgres `?` jsonb key-existence operator collides with Knex `?` positional
// binding parser. Use jsonb_exists() function form to keep bindings unambiguous.

/**
 * @param {import('knex').Knex} database
 * @param {number} bandId
 * @returns {Promise<Array<{
 *   id: string,
 *   email: string|null,
 *   notifications: object|null,
 *   devices: Array<{id, endpoint, keys_p256dh, keys_auth}>
 * }>>}
 */
export async function loadRecipientsForBand(database, bandId) {
	const result = await database.raw(`
		SELECT
			u.id,
			u.email,
			u.settings::jsonb -> 'notifications' AS notifications,
			COALESCE(
				json_agg(
					json_build_object(
						'id', ps.id,
						'endpoint', ps.endpoint,
						'keys_p256dh', ps.keys_p256dh,
						'keys_auth', ps.keys_auth
					)
				) FILTER (WHERE ps.id IS NOT NULL),
				'[]'::json
			) AS devices
		FROM directus_users u
		LEFT JOIN push_subscriptions ps ON ps.user = u.id
		WHERE jsonb_exists(u.settings::jsonb -> 'notifications' -> 'bands', ?)
		  AND u.status = 'active'
		GROUP BY u.id, u.email, u.settings
	`, [String(bandId)]);

	return result.rows.map(r => ({
		id: r.id,
		email: r.email,
		notifications: r.notifications,
		devices: r.devices ?? [],
	}));
}
