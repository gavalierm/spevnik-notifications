// src/lib/templates/email.js — HTML body builder pre per-event email.
//
// Subject layout: `<event_label>: <entity> [(<date>)] — <band>`
//   Band ide na koniec — väčšina userov má len 1 kapelu, takže ide o secondary
//   kontext, nie identifying header.

function appUrl() {
	return process.env.BATCH_EMAIL_APP_URL || process.env.PUBLIC_URL?.replace(/\/+$/, '') || '';
}

function fmtDate(d) {
	if (!d) return '';
	const dt = d instanceof Date ? d : new Date(d);
	if (isNaN(dt.getTime())) return '';
	return `${dt.getDate()}.${dt.getMonth() + 1}.${dt.getFullYear()}`;
}

// `<entity.title> (<date>)` ak je date prítomný, inak len title.
function setlistLabel(entity) {
	const t = entity.title || '(bez názvu)';
	const d = fmtDate(entity.date);
	return d ? `${t} (${d})` : t;
}

const SUBJECTS = {
	// band_create: entity je samotná kapela — nepotrebuje suffix s band.title (duplicita).
	band_create: (band, entity) => `Nová kapela: ${entity.title}`,
	album_create: (band, entity) => `Nový album: ${entity.title} — ${band.title}`,
	setlist_create: (band, entity) => `Nový setlist: ${setlistLabel(entity)} — ${band.title}`,
	setlist_update: (band, entity) => `Setlist aktualizovaný: ${setlistLabel(entity)} — ${band.title}`,
	setlist_attendance_invited: (band, entity) => `Pozvánka: ${setlistLabel(entity)} — ${band.title}`,
	setlist_attendance_responded: (band, entity, ctx) => {
		const c = ctx?.confirmedCount ?? 0;
		const d = ctx?.declinedCount ?? 0;
		const t = ctx?.totalCount ?? 0;
		return `Účasť ${c}+/${d}- z ${t}: ${setlistLabel(entity)} — ${band.title}`;
	},
	song_create: (band, entity) => `Nová pieseň: ${entity.title || ''} — ${band.title}`,
	song_update: (band, entity) => `Pieseň aktualizovaná: ${entity.title || ''} — ${band.title}`,
};

const BODY_LINES = {
	band_create: (entity) => `Bola vytvorená nová kapela <b>${escapeHtml(entity.title)}</b>.`,
	album_create: (entity) => `Nový album <b>${escapeHtml(entity.title)}</b> bol pridaný do kapely.`,
	setlist_create: (entity) => `Nový setlist <b>${escapeHtml(entity.title || '(bez názvu)')}</b>${dateSuffix(entity)} bol pridaný do kapely.`,
	setlist_update: (entity) => `Setlist <b>${escapeHtml(entity.title || '(bez názvu)')}</b>${dateSuffix(entity)} bol aktualizovaný.`,
	setlist_attendance_invited: (entity) => `Bol/a si pozvaný/á do setlistu <b>${escapeHtml(entity.title || '(bez názvu)')}</b>${dateSuffix(entity)}.`,
	setlist_attendance_responded: (entity, ctx) => {
		const c = ctx?.confirmedCount ?? 0;
		const d = ctx?.declinedCount ?? 0;
		const r = ctx?.respondedCount ?? 0;
		const t = ctx?.totalCount ?? 0;
		return `Aktuálny stav účasti v setliste <b>${escapeHtml(entity.title || '(bez názvu)')}</b>${dateSuffix(entity)}:<br>`
			+ `Potvrdených: <b>${c}</b><br>`
			+ `Zamietnutých: <b>${d}</b><br>`
			+ `Celkovo: <b>${r}/${t}</b>`;
	},
	song_create: (entity) => `Nová pieseň <b>${escapeHtml(entity.title || '(bez názvu)')}</b> bola pridaná.`,
	song_update: (entity) => `Pieseň <b>${escapeHtml(entity.title || '(bez názvu)')}</b> bola aktualizovaná.`,
};

function dateSuffix(entity) {
	const d = fmtDate(entity.date);
	return d ? ` (${d})` : '';
}

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
