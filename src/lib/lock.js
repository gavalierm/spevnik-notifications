// src/lib/lock.js — Postgres advisory lock pre worker mutex.
//
// pg_try_advisory_lock je session-scoped, automaticky sa uvoľní pri disconnect.
// Worker beží v Directus context-e ktorý zdieľa connection pool — lock musí byť
// získaný a uvoľnený v rámci jedného worker behu cez ten istý pool connection.

import { ADVISORY_LOCK_KEY } from './constants.js';

/**
 * Pokus o získanie advisory lock-u. Vráti true ak získaný, false ak je už held.
 */
export async function acquireLock(database) {
	const r = await database.raw('SELECT pg_try_advisory_lock(?) AS locked', [ADVISORY_LOCK_KEY]);
	return r.rows[0].locked === true;
}

/**
 * Uvoľní advisory lock. Vždy volaj v finally bloku.
 */
export async function releaseLock(database) {
	try {
		await database.raw('SELECT pg_advisory_unlock(?)', [ADVISORY_LOCK_KEY]);
	} catch {
		// Ak connection už died, lock sa uvoľní automaticky.
	}
}
