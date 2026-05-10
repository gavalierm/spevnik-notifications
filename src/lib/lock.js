// src/lib/lock.js — Postgres transaction-scoped advisory lock pre worker mutex.
//
// pg_try_advisory_xact_lock auto-releases pri commit/rollback transakcie.
// Bezpečnejšie ako session-scoped lock: Knex pool negarantuje že acquire +
// release prejdú cez tú istú backend connection.
//
// Usage pattern:
//   await database.transaction(async trx => {
//     const got = await acquireLock(trx);
//     if (!got) return;
//     try { ...work... }
//     finally { /* lock auto-released on trx commit/rollback */ }
//   });

import { ADVISORY_LOCK_KEY } from './constants.js';

/**
 * Pokus o získanie xact-scoped advisory lock-u VNÚTRI prebiehajúcej transakcie.
 * Lock sa automaticky uvoľní pri commit/rollback transakcie.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @returns {Promise<boolean>} true ak získaný, false ak je už held inou transakciou
 */
export async function acquireLock(trx) {
	const r = await trx.raw('SELECT pg_try_advisory_xact_lock(?) AS locked', [ADVISORY_LOCK_KEY]);
	return r.rows[0].locked === true;
}
