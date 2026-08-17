// src/lib/recipients.js — bulk resolve users + devices for a band.
//
// Single jsonb query: vráti všetkých users related k bandu (cez settings.notifications.bands)
// + ich push_subscriptions joinom. Žiadny round-trip per recipient.
//
// Note 1: Postgres `?` jsonb key-existence operator collides with Knex `?` positional
// binding parser. Use jsonb_exists() function form to keep bindings unambiguous.
//
// Note 2: directus_users.settings je `json` (nie `jsonb`) — json nemá equality operator,
// takže nemôže byť v GROUP BY. Spoliehame sa na PostgreSQL functional dependency:
// GROUP BY u.id (PK) povoľuje SELECT všetkých u.* stĺpcov bez agregácie.
//
// Note 3: is_member sa počíta cez korelovaný EXISTS subquery, NIE cez LEFT JOIN na `access`.
// Dva nezávislé LEFT JOINy na to isté u.id (ps aj access) by vytvorili cross-product vo FROM
// klauzule ešte pred GROUP BY — pri používateľovi s viac než jedným `access` riadkom pre tú
// istú (user, band) dvojicu by sa zariadenia v `devices` duplikovali (json_agg cez nafúknuté
// riadky). EXISTS je skalárny výraz vyhodnotený per u.id, žiadny JOIN, žiadny cross-product.

/**
 * @param {import('knex').Knex} database
 * @param {number} bandId
 * @returns {Promise<Array<{
 *   id: string,
 *   email: string|null,
 *   notifications: object|null,
 *   devices: Array<{id, endpoint, keys_p256dh, keys_auth}>,
 *   isMember: boolean
 * }>>} isMember = existuje riadok v `access` pre (user, band); `member`/`manager`/`owner`
 * v tej tabuľke sú viditeľnosti roly (public/unlisted/private/null), nie príznaky členstva.
 */
export async function loadRecipientsForBand(database, bandId) {
	const result = await database.raw(`
		SELECT
			u.id,
			u.email,
			u.settings::jsonb -> 'notifications' AS notifications,
			EXISTS (SELECT 1 FROM access a WHERE a.user = u.id AND a.band = ?) AS is_member,
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
		GROUP BY u.id
	`, [bandId, String(bandId)]);

	return result.rows.map(r => ({
		id: r.id,
		email: r.email,
		notifications: r.notifications,
		devices: r.devices ?? [],
		isMember: r.is_member === true,
	}));
}
