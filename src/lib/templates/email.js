// src/lib/templates/email.js — HTML body builder pre per-event email.

function appUrl() {
	return process.env.BATCH_EMAIL_APP_URL || process.env.PUBLIC_URL?.replace(/\/+$/, '') || '';
}

const SUBJECTS = {
	band_create: (band, entity, ctx) => ctx?.entityCollection === 'albums'
		? `${band.title} — Nový album: ${entity.title}`
		: `Nová kapela: ${entity.title}`,
	setlist_create: (band, entity) => `${band.title} — Nový setlist: ${entity.title || ''}`,
	setlist_update: (band, entity) => `${band.title} — Setlist aktualizovaný: ${entity.title || ''}`,
	setlist_attendance_invited: (band, entity) => `${band.title} — Pozvánka: ${entity.title || ''}`,
	setlist_attendance_responded: (band, entity, ctx) => `${band.title} — Účasť v ${entity.title || 'setliste'}: ${ctx?.confirmedCount ?? 0}/${ctx?.totalCount ?? 0}`,
	song_create: (band, entity) => `${band.title} — Nová pieseň: ${entity.title || ''}`,
	song_update: (band, entity) => `${band.title} — Pieseň aktualizovaná: ${entity.title || ''}`,
};

const BODY_LINES = {
	band_create: (entity, ctx) => ctx?.entityCollection === 'albums'
		? `Nový album <b>${escapeHtml(entity.title)}</b> bol pridaný do kapely.`
		: `Bola vytvorená nová kapela <b>${escapeHtml(entity.title)}</b>.`,
	setlist_create: (entity) => `Nový setlist <b>${escapeHtml(entity.title || '(bez názvu)')}</b> bol pridaný do kapely.`,
	setlist_update: (entity) => `Setlist <b>${escapeHtml(entity.title || '(bez názvu)')}</b> bol aktualizovaný.`,
	setlist_attendance_invited: (entity) => `Bol/a si pozvaný/á do setlistu <b>${escapeHtml(entity.title || '(bez názvu)')}</b>.`,
	setlist_attendance_responded: (entity, ctx) => `Aktuálny stav účasti v setliste <b>${escapeHtml(entity.title || '(bez názvu)')}</b>: <b>${ctx?.confirmedCount ?? 0}/${ctx?.totalCount ?? 0}</b> potvrdených.`,
	song_create: (entity) => `Nová pieseň <b>${escapeHtml(entity.title || '(bez názvu)')}</b> bola pridaná.`,
	song_update: (entity) => `Pieseň <b>${escapeHtml(entity.title || '(bez názvu)')}</b> bola aktualizovaná.`,
};

function escapeHtml(s) {
	return String(s ?? '').replace(/[&<>"']/g, (c) => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
	}[c]));
}

/**
 * @returns {{ subject: string, html: string }}
 */
export function buildEmailPayload(eventKey, band, entity, ctx) {
	const rawSubject = SUBJECTS[eventKey]?.(band, entity, ctx) ?? `${band.title} — zmena`;
	// SMTP headers (RFC 5322): no CR/LF allowed in subject. Defensive sanitization
	// in case band/entity title contains injected newlines.
	const subject = rawSubject.replace(/[\r\n]+/g, ' ').slice(0, 998);
	const line = BODY_LINES[eventKey]?.(entity, ctx) ?? '';

	const html =
		`<div style="background:#1b1e1f;color:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:32px;max-width:520px;margin:0 auto">`
		+ `<div style="text-align:center;margin-bottom:24px"><span style="font-size:24px;font-weight:bold;color:#fff">${escapeHtml(band.title)}</span></div>`
		+ `<div style="background:#252829;border-radius:12px;padding:20px;margin-bottom:20px"><p style="margin:0;color:#fff;font-size:14px;line-height:1.5">${line}</p></div>`
		+ (function() {
			const url = appUrl();
			return url ? `<div style="text-align:center;margin:24px 0"><a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:bold">Otvoriť Spevník</a></div>` : '';
		})()
		+ `<hr style="border:none;border-top:1px solid #333;margin:24px 0">`
		+ `<p style="color:#666;font-size:11px;text-align:center;margin:0">Tento email bol odoslaný automaticky z aplikácie Spevník.</p>`
		+ `</div>`;

	return { subject, html };
}
