/**
 * Wspólna obsługa formularzy: konfiguracja SMTP, reCAPTCHA, filtr botów
 * i wysyłka wiadomości.
 *
 * Nowy formularz na stronie sprowadza się do jednego pliku w `src/pages/api/`,
 * który wywołuje `createFormRoute` i opisuje wyłącznie treść maila. Sprawdzenie
 * zgody, reCAPTCHA, pułapki na boty, nagłówki, obsługa błędów i stopka
 * wiadomości są wtedy takie same dla wszystkich formularzy.
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { APIRoute } from 'astro';
import { site } from '../data/site';
import { env, envAny, stripQuotes } from './env';
import {
  renderMail,
  renderMailText,
  replyByCallout,
  submissionTimestamp,
  type MailDocument,
  type MailRow,
} from './mail';

export const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const DSN_PATTERN = /^smtps?:\/\//i;

/**
 * Sprowadza wartość do samego adresu DSN. Poza cudzysłowami zdejmuje też
 * przedrostek `NAZWA=`, również pod inną nazwą zmiennej niż nasza
 * (`MAILER_DSN=smtp://...`) - w panelu hostingu łatwo wkleić całą linię.
 */
const normalizeDsn = (value: string): string => {
  const assignment = /^[A-Za-z_][A-Za-z0-9_]*\s*=\s*([\s\S]+)$/.exec(value);
  if (!assignment) return value;
  const rest = stripQuotes(assignment[1].trim());
  return DSN_PATTERN.test(rest) ? rest : value;
};

/** Adres DSN bez hasła - dopiero w tej postaci wolno go zapisać w logach. */
export const redactDsn = (dsn: string): string =>
  dsn.replace(/\/\/([^:/@]*)(?::[^/@]*)?@/g, (_match, user: string) => `//${user}:***@`);

type DsnParse = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * Sprawdza adres SMTP, zanim trafi do nodemailera.
 *
 * Nodemailer rozpoznaje napis jako adres tylko wtedy, gdy zaczyna się od
 * `smtp:`, `smtps:` albo `direct:`. Każdy inny napis traktuje jak gotowy obiekt
 * transportu i przewraca się na `Cannot create property 'mailer' on string` -
 * komunikacie bez związku z prawdziwą przyczyną, czyli literówką w konfiguracji.
 */
const parseDsn = (dsn: string): DsnParse => {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    // Najczęstsza literówka: po danych logowania zostaje drugie "://",
    // przez co adres nie ma nazwy hosta.
    const hint = /@:?\/\//.test(dsn)
      ? 'po znaku "@" musi stać sama nazwa serwera, bez "://" (np. @smtp-relay.brevo.com:587)'
      : 'oczekiwano smtps://uzytkownik:haslo@serwer:465';
    return { ok: false, reason: `wartość nie jest adresem URL - ${hint}` };
  }
  if (url.protocol !== 'smtp:' && url.protocol !== 'smtps:') {
    return { ok: false, reason: `nieobsługiwany protokół "${url.protocol}" (oczekiwano smtp:// albo smtps://)` };
  }
  if (!url.hostname) {
    return { ok: false, reason: 'brak nazwy serwera SMTP po znaku "@" (np. @smtp-relay.brevo.com:587)' };
  }
  return { ok: true, url };
};

export type MailConfig = { dsn: string; to: string; from: string };

/** Konfiguracja gotowa do użycia albo powód, dla którego wysyłka nie zadziała. */
export type MailConfigResult = { ok: true; config: MailConfig } | { ok: false; reason: string };

/**
 * Zwraca konfigurację SMTP. Adres jest sprawdzany już tutaj, żeby błąd
 * konfiguracji był widoczny w logach jako opis pomyłki, a nie jako wyjątek
 * z wnętrza nodemailera przy pierwszej próbie wysyłki.
 */
export function getMailConfig(): MailConfigResult {
  const rawDsn = envAny('EMAIL_DSN', 'MAILER_DSN');
  const to = env('EMAIL_TO');
  if (!rawDsn || !to) {
    const missing: string[] = [];
    if (!rawDsn) missing.push('EMAIL_DSN');
    if (!to) missing.push('EMAIL_TO');
    return { ok: false, reason: `brak zmiennych środowiskowych: ${missing.join(', ')}` };
  }

  const dsn = normalizeDsn(rawDsn);
  const parsed = parseDsn(dsn);
  if (!parsed.ok) {
    return { ok: false, reason: `EMAIL_DSN jest nieprawidłowy - ${parsed.reason}; wartość: ${redactDsn(dsn)}` };
  }

  // Część serwerów SMTP odrzuca wiadomość, gdy nadawca nie jest kontem
  // uwierzytelnionym - stąd osobna zmienna. Domyślnie nadawcą jest odbiorca.
  const configured = env('EMAIL_FROM') ?? to;
  // Adres podany razem z nazwą ("Taxun <biuro@...>") zostawiamy bez zmian.
  const from = configured.includes('<') ? configured : `${site.name} - formularz <${configured}>`;
  return { ok: true, config: { dsn, to, from } };
}

/* ── reCAPTCHA ───────────────────────────────────────────────────────────── */

export type RecaptchaResult = { ok: true; score: number | null } | { ok: false; reason: string };

/** Próg, poniżej którego Google uznaje ruch za automat. */
const RECAPTCHA_MIN_SCORE = 0.5;

/**
 * Sprawdza token reCAPTCHA v3. Gdy sekret nie jest skonfigurowany, weryfikację
 * pomijamy - dzięki temu formularz działa również na środowisku lokalnym.
 */
export async function verifyRecaptcha(token: unknown, action: string): Promise<RecaptchaResult> {
  const secret = env('RECAPTCHA_SECRET_KEY');
  if (!secret) return { ok: true, score: null };
  if (typeof token !== 'string' || !token) return { ok: false, reason: 'Missing reCAPTCHA token' };

  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success: boolean; score?: number; action?: string };
    if (!data.success) return { ok: false, reason: 'reCAPTCHA verification failed' };
    // Akcję sprawdzamy tylko wtedy, gdy Google ją zwróciło - inaczej odrzucalibyśmy
    // poprawne zgłoszenia z kluczy v2, w których pola action nie ma.
    if (data.action && data.action !== action) return { ok: false, reason: 'reCAPTCHA action mismatch' };
    const score = typeof data.score === 'number' ? data.score : null;
    if (score !== null && score < RECAPTCHA_MIN_SCORE) return { ok: false, reason: 'reCAPTCHA score too low' };
    return { ok: true, score };
  } catch (err) {
    console.error('[recaptcha] verification error', err);
    return { ok: false, reason: 'reCAPTCHA unavailable' };
  }
}

/* ── Wysyłka ─────────────────────────────────────────────────────────────── */

/** Adres zwrotny: sam e-mail albo e-mail wraz z nazwą nadawcy zgłoszenia. */
export type ReplyTo = string | { name: string; address: string };

export type OutgoingMail = {
  config: MailConfig;
  subject: string;
  html: string;
  text: string;
  replyTo: ReplyTo;
};

// Bez limitów czasu wiszące połączenie SMTP potrafi wyczerpać cały budżet czasu
// funkcji serwerowej i zwrócić użytkownikowi błąd bez żadnego komunikatu.
const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };

/** Wartość z adresu DSN sprowadzona do typu, jakiego oczekuje nodemailer. */
const dsnValue = (value: string): string | number | boolean => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
};

/** Odkodowanie danych logowania - wartość bez kodowania zostawiamy bez zmian. */
const decodePart = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * Rozkłada adres DSN na opcje połączenia.
 *
 * Nodemailer potrafi sam sparsować adres, ale wtedy nie da się dołożyć limitów
 * czasu: drugi argument `createTransport` to wartości domyślne wiadomości, a nie
 * ustawienia transportu.
 */
function transportConfig(url: URL): Parameters<typeof nodemailer.createTransport>[0] {
  const secure = url.protocol === 'smtps:';
  const options: Record<string, unknown> = {
    host: url.hostname,
    port: url.port ? Number(url.port) : secure ? 465 : 587,
    secure,
    ...TIMEOUTS,
  };
  if (url.username) {
    options.auth = { user: decodePart(url.username), pass: decodePart(url.password) };
  }
  // Parametry z adresu (np. ?pool=true) działają tak samo jak u nodemailera.
  for (const [key, value] of url.searchParams) options[key] = dsnValue(value);
  return options as Parameters<typeof nodemailer.createTransport>[0];
}

// Transport trzyma pulę połączeń, więc w obrębie jednej instancji funkcji
// serwerowej opłaca się go zachować między zgłoszeniami.
let cachedTransport: { dsn: string; transport: Transporter } | null = null;

function getTransport(dsn: string): Transporter {
  if (cachedTransport?.dsn === dsn) return cachedTransport.transport;
  const parsed = parseDsn(dsn);
  // Do nodemailera nie oddajemy napisu, którego sami nie potrafimy rozłożyć -
  // dostalibyśmy w zamian wyjątek nie wskazujący na przyczynę.
  if (!parsed.ok) throw new Error(`Nieprawidłowy adres SMTP (EMAIL_DSN) - ${parsed.reason}`);
  const transport = nodemailer.createTransport(transportConfig(parsed.url));
  cachedTransport = { dsn, transport };
  return transport;
}

export async function sendMail({ config, subject, html, text, replyTo }: OutgoingMail): Promise<void> {
  await getTransport(config.dsn).sendMail({
    from: config.from,
    to: config.to,
    replyTo,
    subject,
    html,
    text,
  });
}

/* ── Filtr botów ─────────────────────────────────────────────────────────── */

/**
 * Proste zabezpieczenie przed botami, niezależne od reCAPTCHA: ukryte pole,
 * które człowiek zostawia puste, oraz minimalny czas wypełniania formularza.
 */
export function looksAutomated(body: Record<string, unknown>): boolean {
  if (typeof body.website === 'string' && body.website.trim() !== '') return true;
  const elapsed = Number(body.elapsed);
  if (Number.isFinite(elapsed) && elapsed > 0 && elapsed < 2500) return true;
  return false;
}

/* ── Pomocnicze walidacje pól ────────────────────────────────────────────── */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isEmail = (value: string): boolean => EMAIL_PATTERN.test(value);

/**
 * Przycina wartość z formularza do bezpiecznej długości. Limit jest twardy,
 * żeby pojedyncze zgłoszenie nie potrafiło wysłać megabajtowej wiadomości.
 */
export const trimField = (value: unknown, limit = 200): string =>
  typeof value === 'string' ? value.trim().slice(0, limit) : '';

/* ── Wspólna trasa formularza ────────────────────────────────────────────── */

export type FormContext = {
  body: Record<string, unknown>;
  /** Ocena reCAPTCHA albo null, gdy weryfikacja jest wyłączona. */
  captchaScore: number | null;
};

/** Dokument budowany przez formularz - zgody i stopkę dokłada wspólna trasa. */
export type FormDocument = Omit<MailDocument, 'consents' | 'meta'> & {
  /** Dodatkowe zgody ponad standardowe (prywatność, newsletter). */
  consents?: string[];
  /** Dodatkowe pozycje stopki, np. źródło zgłoszenia. */
  meta?: MailRow[];
};

export type FormOutcome =
  | { ok: true; doc: FormDocument }
  | { ok: false; status?: number; error: string; code?: string; fields?: Record<string, string> };

export type FormDefinition = {
  /** Nazwa akcji reCAPTCHA v3, taka sama jak po stronie przeglądarki. */
  action: string;
  /** Nazwa formularza w stopce wiadomości, np. "Kontakt ogólny". */
  formLabel: string | ((body: Record<string, unknown>) => string);
  /** Identyfikator w logach serwera. */
  logName?: string;
  /** Buduje treść wiadomości albo zwraca błąd walidacji. */
  build: (ctx: FormContext) => FormOutcome | Promise<FormOutcome>;
};

const consentLines = (body: Record<string, unknown>): string[] => [
  '✓ Zgoda na przetwarzanie danych w celu obsługi zapytania (wymagana).',
  body.marketing === true
    ? '✓ Zgoda na newsletter i informacje marketingowe.'
    : '✗ Brak zgody na newsletter.',
];

/**
 * Domyślne przyciski: odpowiedź mailem i telefon. Dzięki temu każdy formularz
 * trafia do skrzynki z tym samym, gotowym do kliknięcia zestawem akcji.
 */
const defaultActions = (doc: FormDocument): MailDocument['actions'] => {
  if (doc.actions) return doc.actions;
  const actions: MailDocument['actions'] = [
    {
      label: 'Odpowiedz na zgłoszenie',
      href: `mailto:${doc.email}?subject=${encodeURIComponent(`Re: ${doc.subject}`)}`,
      primary: true,
    },
  ];
  if (doc.phone) actions.push({ label: 'Zadzwoń', href: `tel:${doc.phone.replace(/[^\d+]/g, '')}` });
  return actions;
};

/**
 * Adres zwrotny wiadomości. Nadawcą jest nasza skrzynka (wymóg SMTP), więc bez
 * tego nagłówka "Odpowiedz" w kliencie poczty wracałoby do nas samych, a nie
 * do klienta.
 */
const replyToAddress = (doc: MailDocument): ReplyTo =>
  doc.personName ? { name: doc.personName, address: doc.email } : doc.email;

/**
 * Buduje trasę POST dla formularza. Kolejność kontroli jest celowa: najpierw
 * odrzucamy zgłoszenia tanie do sprawdzenia (konfiguracja, format, boty),
 * a dopiero potem sięgamy po sieć (reCAPTCHA) i SMTP.
 */
export function createFormRoute(def: FormDefinition): APIRoute {
  const log = def.logName ?? def.action;

  return async ({ request }) => {
    const mail = getMailConfig();
    if (!mail.ok) {
      console.error(`[${log}] konfiguracja e-mail: ${mail.reason}`);
      return json({ ok: false, error: 'Email not configured', code: 'not-configured' }, 503);
    }
    const config = mail.config;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ ok: false, error: 'Invalid request body', code: 'bad-request' }, 400);
    }
    if (body === null || typeof body !== 'object') {
      return json({ ok: false, error: 'Invalid request body', code: 'bad-request' }, 400);
    }

    if (looksAutomated(body)) return json({ ok: false, error: 'Rejected', code: 'bot' }, 400);

    // Zgoda na przetwarzanie danych jest wymagana dla każdego formularza,
    // więc sprawdzamy ją tutaj, a nie w kodzie pojedynczego zgłoszenia.
    if (body.privacy !== true) {
      return json({ ok: false, error: 'Missing privacy consent', code: 'privacy' }, 400);
    }

    const captcha = await verifyRecaptcha(body.recaptchaToken, def.action);
    if (!captcha.ok) {
      console.warn(`[${log}] reCAPTCHA: ${captcha.reason}`);
      return json({ ok: false, error: captcha.reason, code: 'recaptcha' }, 400);
    }

    let outcome: FormOutcome;
    try {
      outcome = await def.build({ body, captchaScore: captcha.score });
    } catch (err) {
      console.error(`[${log}] build error`, err);
      return json({ ok: false, error: 'Failed to build message', code: 'server' }, 500);
    }

    if (!outcome.ok) {
      return json(
        { ok: false, error: outcome.error, code: outcome.code ?? 'validation', fields: outcome.fields },
        outcome.status ?? 400
      );
    }

    const formLabel = typeof def.formLabel === 'function' ? def.formLabel(body) : def.formLabel;
    const doc: MailDocument = {
      ...outcome.doc,
      actions: defaultActions(outcome.doc),
      // Termin odpowiedzi jest obietnicą całej strony, nie pojedynczego
      // formularza - dokładamy go tutaj, żeby był w każdej wiadomości.
      replyBy: outcome.doc.replyBy ?? replyByCallout(),
      consents: [...consentLines(body), ...(outcome.doc.consents ?? [])],
      meta: [
        { label: 'Data zgłoszenia', value: submissionTimestamp() },
        { label: 'Formularz', value: formLabel },
        ...(outcome.doc.meta ?? []),
        ...(captcha.score !== null
          ? [{ label: 'Ocena reCAPTCHA', value: captcha.score.toFixed(2) }]
          : []),
      ],
    };

    try {
      await sendMail({
        config,
        subject: doc.subject,
        html: renderMail(doc),
        text: renderMailText(doc),
        replyTo: replyToAddress(doc),
      });
    } catch (err) {
      console.error(`[${log}] sendMail error`, err);
      return json({ ok: false, error: 'Failed to send email', code: 'send' }, 500);
    }

    // Konwersji nie raportujemy z serwera. Protokół pomiarowy odpowiada 204 na
    // każde poprawne żądanie - również wtedy, gdy zdarzenie jest po cichu
    // odrzucane - więc serwer nie miał jak odróżnić sukcesu od porażki i mógł
    // uciszyć przeglądarkę, meldując konwersję, która nigdy nie dotarła.
    // Zgłoszenie zgłasza więc wyłącznie przeglądarka: jedna droga, w dodatku
    // widoczna w Tag Assistant, DebugView i raporcie czasu rzeczywistego.
    return json({ ok: true });
  };
}
