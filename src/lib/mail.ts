/**
 * Szablony wiadomości e-mail wysyłanych z formularzy.
 *
 * Układ oparty na tabelach i stylach inline, bo tego wymagają klienty pocztowe
 * (Outlook nie zna flexboxa ani grida). Media query odpowiada za złożenie
 * kolumn na telefonie - tam, gdzie klient ją zignoruje, treść i tak pozostaje
 * czytelna, bo każda kolumna ma sensowną szerokość procentową.
 *
 * Ten sam dokument obsługuje wszystkie formularze na stronie: wystarczy zbudować
 * obiekt `MailDocument`, a nagłówek, blok kontaktowy, sekcje i stopka wyglądają
 * identycznie niezależnie od tego, skąd przyszło zgłoszenie.
 */

import { site } from '../data/site';

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Zamienia znaki nowej linii na <br>, po wcześniejszym zabezpieczeniu HTML-a. */
const escapeMultiline = (value: string): string => escapeHtml(value).replace(/\r?\n/g, '<br />');

/** Numer telefonu w formie akceptowanej przez odnośnik tel:. */
const telHref = (phone: string): string => phone.replace(/[^\d+]/g, '');

const INK = '#0A1A35';
const INK_DEEP = '#06112A';
const TEXT = '#0F172A';
const MUTED = '#64748B';
const BORDER = '#E6ECF5';
const ACCENT = '#059669';
const ACCENT_DARK = '#047857';
const ACCENT_SOFT = '#ECFDF5';
const ACCENT_LINE = '#A7F3D0';
const SURFACE = '#F7F9FC';
const CANVAS = '#F4F6FB';

export type MailRow = { label: string; value: string; multiline?: boolean };
export type MailSection = { title: string; rows: MailRow[] };
export type MailTile = { label: string; value: string; accent?: boolean };
/** Wyróżniony blok z jedną liczbą lub datą (kwota, termin odpowiedzi). */
export type MailCallout = { label: string; value: string; note?: string };
/** Przycisk w pasku akcji - `primary` renderuje się jako wypełniony. */
export type MailAction = { label: string; href: string; primary?: boolean };

export type MailDocument = {
  subject: string;
  preheader: string;
  badge: string;
  title: string;
  /** Nagłówek bloku kontaktowego - imię i nazwisko zgłaszającego. */
  personName: string;
  email: string;
  phone?: string;
  company?: string;
  /** Przyciski pod blokiem kontaktowym (odpowiedz / zadzwoń). */
  actions?: MailAction[];
  tiles?: MailTile[];
  callout?: MailCallout;
  /** Termin odpowiedzi - wspólny dla wszystkich formularzy, dokłada go trasa. */
  replyBy?: MailCallout;
  sections: MailSection[];
  message?: { title: string; body: string };
  consents: string[];
  meta: MailRow[];
};

/* ── Elementy składowe ───────────────────────────────────────────────────── */

const FONT = 'Arial,Helvetica,sans-serif';

/** Nagłówek sekcji - ten sam styl dla wszystkich bloków treści. */
const sectionTitle = (text: string): string =>
  `<p style="margin:0 0 10px;font-family:${FONT};font-size:11px;line-height:16px;letter-spacing:0.09em;text-transform:uppercase;font-weight:bold;color:${ACCENT};">${escapeHtml(text)}</p>`;

const tile = (t: MailTile, width: number): string => `
<td class="tile" align="left" valign="top" width="${width}%" style="width:${width}%;padding:0 6px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
    <tr>
      <td bgcolor="${t.accent ? ACCENT_SOFT : SURFACE}" style="background:${t.accent ? ACCENT_SOFT : SURFACE};border:1px solid ${t.accent ? ACCENT_LINE : BORDER};border-radius:12px;padding:14px 16px;">
        <p style="margin:0 0 4px;font-family:${FONT};font-size:11px;line-height:16px;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">${escapeHtml(t.label)}</p>
        <p style="margin:0;font-family:${FONT};font-size:16px;line-height:22px;font-weight:bold;color:${t.accent ? ACCENT : TEXT};">${escapeHtml(t.value)}</p>
      </td>
    </tr>
  </table>
</td>`;

const tilesBlock = (tiles: MailTile[]): string => {
  if (!tiles.length) return '';
  // Szerokość dzielimy równo, więc kafelki działają dla 1, 2 jak i 3 pozycji.
  const width = Math.floor(100 / tiles.length);
  return `
<tr>
  <td class="pad" style="padding:24px 26px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
      <tr>${tiles.map((t) => tile(t, width)).join('')}</tr>
    </table>
  </td>
</tr>`;
};

const rowsBlock = (rows: MailRow[]): string =>
  rows
    .map((r, i) => {
      const divider = i === 0 ? 'none' : `1px solid ${BORDER}`;
      return `
      <tr>
        <td class="r-label" valign="top" width="42%" style="width:42%;padding:11px 14px 11px 0;border-top:${divider};font-family:${FONT};font-size:13px;line-height:19px;color:${MUTED};">${escapeHtml(r.label)}</td>
        <td class="r-value" valign="top" style="padding:11px 0;border-top:${divider};font-family:${FONT};font-size:14px;line-height:20px;font-weight:bold;color:${TEXT};word-break:break-word;">${r.multiline ? escapeMultiline(r.value) : escapeHtml(r.value)}</td>
      </tr>`;
    })
    .join('');

const sectionBlock = (section: MailSection): string => {
  if (!section.rows.length) return '';
  return `
<tr>
  <td class="pad" style="padding:22px 32px 0;">
    ${sectionTitle(section.title)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${rowsBlock(section.rows)}
    </table>
  </td>
</tr>`;
};

const calloutBlock = (callout?: MailCallout): string => {
  if (!callout) return '';
  return `
<tr>
  <td class="pad" style="padding:24px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td bgcolor="${ACCENT_SOFT}" style="background:${ACCENT_SOFT};border:1px solid ${ACCENT_LINE};border-radius:14px;padding:18px 20px;">
          <p style="margin:0 0 4px;font-family:${FONT};font-size:11px;line-height:16px;letter-spacing:0.06em;text-transform:uppercase;color:${ACCENT_DARK};">${escapeHtml(callout.label)}</p>
          <p style="margin:0;font-family:${FONT};font-size:24px;line-height:30px;font-weight:bold;color:#065F46;">${escapeHtml(callout.value)}</p>
          ${callout.note ? `<p style="margin:6px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${ACCENT_DARK};">${escapeHtml(callout.note)}</p>` : ''}
        </td>
      </tr>
    </table>
  </td>
</tr>`;
};

/**
 * Termin odpowiedzi. Węższy wariant wyróżnienia niż `calloutBlock`, bo w części
 * wiadomości (np. wycena) nad nim stoi już kwota - dwa bloki tej samej wagi
 * biłyby się o uwagę.
 */
const replyByBlock = (replyBy?: MailCallout): string => {
  if (!replyBy) return '';
  return `
<tr>
  <td class="pad" style="padding:20px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td bgcolor="${ACCENT_SOFT}" style="background:${ACCENT_SOFT};border:1px solid ${ACCENT_LINE};border-radius:12px;padding:14px 18px;">
          <p style="margin:0 0 3px;font-family:${FONT};font-size:11px;line-height:16px;letter-spacing:0.06em;text-transform:uppercase;color:${ACCENT_DARK};">${escapeHtml(replyBy.label)}</p>
          <p style="margin:0;font-family:${FONT};font-size:18px;line-height:24px;font-weight:bold;color:#065F46;">${escapeHtml(replyBy.value)}</p>
          ${replyBy.note ? `<p style="margin:5px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${ACCENT_DARK};">${escapeHtml(replyBy.note)}</p>` : ''}
        </td>
      </tr>
    </table>
  </td>
</tr>`;
};

/** Wiersz danych kontaktowych: etykieta i klikalny odnośnik (mailto / tel). */
const contactLine = (label: string, href: string, text: string): string => `
<tr>
  <td class="c-label" valign="top" width="64" style="width:64px;padding:6px 12px 0 0;font-family:${FONT};font-size:12px;line-height:20px;color:${MUTED};">${escapeHtml(label)}</td>
  <td class="c-value" valign="top" style="padding:6px 0 0;font-family:${FONT};font-size:15px;line-height:20px;">
    <a href="${escapeHtml(href)}" style="color:${ACCENT};font-weight:bold;text-decoration:underline;word-break:break-word;">${escapeHtml(text)}</a>
  </td>
</tr>`;

const contactBlock = (doc: MailDocument): string => `
<tr>
  <td class="pad" style="padding:24px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="border:1px solid ${BORDER};border-radius:14px;padding:18px 20px;">
          <p style="margin:0;font-family:${FONT};font-size:18px;line-height:24px;font-weight:bold;color:${TEXT};">${escapeHtml(doc.personName)}</p>
          ${
            doc.company
              ? `<p style="margin:2px 0 0;font-family:${FONT};font-size:13px;line-height:19px;color:${MUTED};">${escapeHtml(doc.company)}</p>`
              : ''
          }
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">
            ${contactLine('E-mail', `mailto:${doc.email}`, doc.email)}
            ${doc.phone ? contactLine('Telefon', `tel:${telHref(doc.phone)}`, doc.phone) : ''}
          </table>
        </td>
      </tr>
    </table>
  </td>
</tr>`;

/**
 * Pasek akcji. Na desktopie przyciski stoją obok siebie, na telefonie media
 * query układa je jeden pod drugim na pełną szerokość.
 */
const actionsBlock = (actions: MailAction[] = []): string => {
  if (!actions.length) return '';
  const button = (a: MailAction): string => `
        <td class="btn-cell" bgcolor="${a.primary ? ACCENT : '#FFFFFF'}" style="background:${a.primary ? ACCENT : '#FFFFFF'};border:1px solid ${a.primary ? ACCENT : BORDER};border-radius:10px;">
          <a class="btn-link" href="${escapeHtml(a.href)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;line-height:18px;font-weight:bold;text-align:center;text-decoration:none;color:${a.primary ? '#FFFFFF' : TEXT};">${escapeHtml(a.label)}</a>
        </td>`;
  return `
<tr>
  <td class="pad" style="padding:16px 32px 0;">
    <table role="presentation" class="btn-table" cellpadding="0" cellspacing="0" border="0">
      <tr>
        ${actions.map(button).join('<td class="btn-gap" width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>')}
      </tr>
    </table>
  </td>
</tr>`;
};

const messageBlock = (message: MailDocument['message']): string => {
  if (!message || !message.body.trim()) return '';
  return `
<tr>
  <td class="pad" style="padding:24px 32px 0;">
    ${sectionTitle(message.title)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td bgcolor="${SURFACE}" style="background:${SURFACE};border-left:3px solid ${ACCENT};border-radius:0 12px 12px 0;padding:16px 18px;font-family:${FONT};font-size:14px;line-height:22px;color:${TEXT};word-break:break-word;">${escapeMultiline(message.body)}</td>
      </tr>
    </table>
  </td>
</tr>`;
};

const consentsBlock = (consents: string[]): string => {
  if (!consents.length) return '';
  return `
<tr>
  <td class="pad" style="padding:22px 32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="border-top:1px solid ${BORDER};padding-top:14px;font-family:${FONT};font-size:12px;line-height:20px;color:${MUTED};">
          ${consents.map((c) => escapeHtml(c)).join('<br />')}
        </td>
      </tr>
    </table>
  </td>
</tr>`;
};

/* ── Dokument ────────────────────────────────────────────────────────────── */

export function renderMail(doc: MailDocument): string {
  return `<!DOCTYPE html>
<html lang="pl" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(doc.subject)}</title>
<style>
  body { margin:0; padding:0; width:100% !important; background:${CANVAS}; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  a { color:${ACCENT}; }
  @media only screen and (max-width:620px) {
    .wrap { width:100% !important; border-radius:0 !important; border-left:none !important; border-right:none !important; }
    /* Jedna szerokość marginesu dla wszystkich bloków - inaczej nagłówek
       zwężałby się bardziej niż treść pod nim. */
    .pad { padding-left:20px !important; padding-right:20px !important; }
    .tile { display:block !important; width:100% !important; padding:0 0 8px !important; }
    /* Etykieta nad wartością - dwie kolumny na 320 px są za ciasne. */
    .r-label { display:block !important; width:100% !important; padding:11px 0 0 !important; }
    .r-value { display:block !important; width:100% !important; padding:1px 0 11px !important; border-top:none !important; }
    .c-label { display:block !important; width:100% !important; padding:8px 0 0 !important; }
    .c-value { display:block !important; width:100% !important; padding:0 !important; }
    /* Przyciski na pełną szerokość karty, jeden pod drugim. */
    .btn-table { width:100% !important; }
    .btn-cell { display:block !important; width:100% !important; margin-bottom:8px !important; }
    .btn-link { display:block !important; }
    .btn-gap { display:none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${CANVAS};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(doc.preheader)}</div>
<!-- Wypycha treść maila z podglądu na liście wiadomości. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${'&#847;&zwnj;&nbsp;'.repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CANVAS}" style="background:${CANVAS};">
  <tr>
    <td align="center" style="padding:28px 12px 36px;">
      <table role="presentation" class="wrap" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;background:#FFFFFF;border-radius:18px;overflow:hidden;border:1px solid ${BORDER};">

        <tr>
          <td bgcolor="${INK}" class="pad" style="background:${INK};background-image:linear-gradient(135deg, ${INK} 0%, ${INK_DEEP} 100%);padding:26px 32px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="left" style="font-family:${FONT};font-size:15px;line-height:20px;font-weight:bold;letter-spacing:0.02em;color:#FFFFFF;">
                  ${escapeHtml(site.name)}<span style="color:#34D399;">.</span>
                </td>
                <td align="right" style="font-family:${FONT};font-size:11px;line-height:18px;color:#94A3B8;">${escapeHtml(site.url.replace('https://', ''))}</td>
              </tr>
            </table>
            <p style="margin:20px 0 0;">
              <span style="display:inline-block;background:rgba(16,185,129,0.16);border:1px solid rgba(52,211,153,0.45);border-radius:999px;padding:5px 12px;font-family:${FONT};font-size:11px;line-height:16px;font-weight:bold;letter-spacing:0.06em;text-transform:uppercase;color:#6EE7B7;">${escapeHtml(doc.badge)}</span>
            </p>
            <h1 style="margin:12px 0 0;font-family:${FONT};font-size:24px;line-height:31px;font-weight:bold;color:#FFFFFF;">${escapeHtml(doc.title)}</h1>
          </td>
        </tr>
        <tr><td bgcolor="${ACCENT}" style="background:${ACCENT};background-image:linear-gradient(90deg,#059669 0%,#34D399 100%);height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>

        ${contactBlock(doc)}
        ${actionsBlock(doc.actions)}
        ${calloutBlock(doc.callout)}
        ${replyByBlock(doc.replyBy)}
        ${tilesBlock(doc.tiles ?? [])}
        ${doc.sections.map(sectionBlock).join('')}
        ${messageBlock(doc.message)}
        ${consentsBlock(doc.consents)}

        <tr>
          <td class="pad" style="padding:24px 32px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td bgcolor="${SURFACE}" style="background:${SURFACE};border-radius:12px;padding:14px 16px;font-family:${FONT};font-size:11px;line-height:18px;color:${MUTED};">
                  ${doc.meta.map((m) => `${escapeHtml(m.label)}: <span style="color:${TEXT};">${escapeHtml(m.value)}</span>`).join('<br />')}
                </td>
              </tr>
            </table>
            <p style="margin:14px 0 0;font-family:${FONT};font-size:11px;line-height:18px;color:#94A3B8;">
              Wiadomość wygenerowana automatycznie przez formularz na ${escapeHtml(site.url.replace('https://', ''))}.
              Odpowiedź na tego maila trafi bezpośrednio do osoby zgłaszającej.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Wersja tekstowa - ten sam komplet danych dla klientów bez HTML-a. */
export function renderMailText(doc: MailDocument): string {
  const lines: string[] = [
    doc.badge.toUpperCase(),
    doc.title,
    '='.repeat(Math.min(doc.title.length, 60)),
    '',
    doc.personName,
    doc.company ? doc.company : null,
    `E-mail: ${doc.email}`,
    doc.phone ? `Telefon: ${doc.phone}` : null,
  ].filter((l): l is string => l !== null);

  for (const box of [doc.callout, doc.replyBy]) {
    if (!box) continue;
    lines.push('', `${box.label}: ${box.value}`);
    if (box.note) lines.push(box.note);
  }
  for (const tileItem of doc.tiles ?? []) lines.push('', `${tileItem.label}: ${tileItem.value}`);
  for (const section of doc.sections) {
    if (!section.rows.length) continue;
    lines.push('', `- ${section.title} -`);
    for (const row of section.rows) lines.push(`${row.label}: ${row.value}`);
  }
  if (doc.message && doc.message.body.trim()) {
    lines.push('', `- ${doc.message.title} -`, doc.message.body);
  }
  if (doc.consents.length) lines.push('', ...doc.consents);
  if (doc.meta.length) lines.push('', ...doc.meta.map((m) => `${m.label}: ${m.value}`));
  return lines.join('\n');
}

/** Data i godzina zgłoszenia w strefie warszawskiej. */
export function submissionTimestamp(date = new Date()): string {
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Warsaw',
  }).format(date);
}

/* ── Termin odpowiedzi ───────────────────────────────────────────────────── */

const WORK_START = 8;
const WORK_END = 18;
/** Standardowy czas odpowiedzi podawany na stronie, liczony w godzinach roboczych. */
const SLA_HOURS = 4;

/** Rozkłada datę na "zegar ścienny" w Warszawie (bez przesunięcia strefy). */
function warsawParts(date: Date): { y: number; m: number; d: number; h: number; min: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
}

/**
 * Termin odpowiedzi zgodny z obietnicą ze strony: cztery godziny robocze,
 * w dni powszednie między 8:00 a 18:00.
 *
 * Liczymy na zegarze ściennym Warszawy zapisanym jako czas UTC. Wynik służy
 * wyłącznie do sformatowania tekstu, więc nie wraca do strefy czasowej i nie
 * gubi się na zmianie czasu.
 */
export function replyDeadline(from = new Date()): string {
  const p = warsawParts(from);
  const submitted = new Date(Date.UTC(p.y, p.m - 1, p.d, p.h, p.min));
  const cursor = new Date(submitted);

  const startOfNextWorkday = () => {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    cursor.setUTCHours(WORK_START, 0, 0, 0);
  };

  // Przesuwamy się na najbliższą godzinę roboczą.
  if (cursor.getUTCHours() >= WORK_END) startOfNextWorkday();
  else if (cursor.getUTCHours() < WORK_START) cursor.setUTCHours(WORK_START, 0, 0, 0);
  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) startOfNextWorkday();

  // Dodajemy godziny SLA, przenosząc nadmiar na kolejne dni robocze.
  let left = SLA_HOURS * 60;
  while (left > 0) {
    const endOfDay = new Date(cursor);
    endOfDay.setUTCHours(WORK_END, 0, 0, 0);
    const available = (endOfDay.getTime() - cursor.getTime()) / 60_000;
    if (left <= available) {
      cursor.setUTCMinutes(cursor.getUTCMinutes() + left);
      left = 0;
      break;
    }
    left -= available;
    startOfNextWorkday();
    while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) startOfNextWorkday();
  }

  const time = new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
  }).format(cursor);

  const sameDay =
    cursor.getUTCFullYear() === submitted.getUTCFullYear() &&
    cursor.getUTCMonth() === submitted.getUTCMonth() &&
    cursor.getUTCDate() === submitted.getUTCDate();
  if (sameDay) return `dziś do ${time}`;

  const day = new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(cursor);
  return `${day}, do ${time}`;
}

/**
 * Gotowy blok "Termin odpowiedzi" - ten sam dla każdego formularza, więc
 * wystarczy go dołożyć raz we wspólnej trasie (`createFormRoute`).
 */
export function replyByCallout(from = new Date()): MailCallout {
  return {
    label: 'Szacunkowy czas odpowiedzi',
    value: replyDeadline(from),
    note: `Standardowy czas odpowiedzi podawany na stronie: ${SLA_HOURS} godziny robocze (pon - pt, ${WORK_START}:00 - ${WORK_END}:00).`,
  };
}
