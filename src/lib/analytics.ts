/**
 * Google Analytics 4 - warstwa kliencka.
 *
 * Jedyne miejsce, przez które strona rozmawia z GA4 w przeglądarce. Skrypt
 * gtag.js wstawia komponent `GoogleTag.astro` (tylko gdy ustawione jest
 * PUBLIC_GA_ID), a ten moduł daje resztę kodu typowane, bezpieczne funkcje:
 * bez konfiguracji GA wywołania po prostu nic nie robią.
 *
 * Zgody: pracujemy w zaawansowanym trybie zgody (patrz `GoogleTag.astro`).
 * Zdarzenia wysyłamy niezależnie od decyzji użytkownika, bo o tym, co Google
 * wolno z nimi zrobić, rozstrzyga stan Consent Mode, a nie to, czy trafienie
 * w ogóle poleci. Przy odmowie Google nie zapisuje ciasteczek ani
 * identyfikatorów i używa trafienia wyłącznie do statystycznego modelowania;
 * po zgodzie pomiar jest pełny. Decyzję użytkownika - również odmowną -
 * przekazuje `consent-integrations.ts`.
 *
 * Dlatego w zdarzeniach nie umieszczamy niczego, co identyfikuje osobę: idzie
 * nazwa formularza, kwota, źródło ruchu i kod błędu. Danych z formularza -
 * imienia, adresu, telefonu, treści wiadomości - nie wysyłamy nigdy.
 *
 * Mierzymy świadomie mało - ruch i próby kontaktu:
 *
 *   • `page_view`     - odsłona, raz na wczytanie strony. Nie wysyłamy jej
 *     stąd nigdy: robi to `gtag('config', ...)`, a ponawianie po zmianie zgody
 *     dublowałoby wyniki,
 *   • `generate_lead` - zgłoszenie z formularza przyjęte przez serwer,
 *   • `phone_click`   - kliknięcie w numer telefonu gdziekolwiek w serwisie,
 *   • `lead_form_error` - odrzucona wysyłka; jedyny sygnał, że formularz się
 *     komuś wysypuje.
 *
 * Dwa środkowe to konwersje (patrz `data/conversions.ts`).
 *
 * Reszty nie mierzymy własnym kodem. Przewijanie, linki wychodzące, pobrania
 * plików i interakcje z formularzami potrafi zgłaszać pomiar ulepszony GA4 -
 * jeśli mają być mierzone, włącza się je przełącznikiem w ustawieniach
 * strumienia danych, a nie skryptem na stronie.
 */

// Import dla efektu ubocznego: gwarantuje, że `window.taxunConsent` istnieje,
// zanim którakolwiek funkcja z tego modułu sprawdzi zgodę.
import './consent';
import { FORM_ERROR_EVENT, LEAD_EVENT, PHONE_EVENT } from '../data/conversions';
import { trafficSourceParams } from './traffic-source';

export type AnalyticsParams = Record<string, string | number | boolean | undefined | null>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Measurement ID wstawiany podczas budowania (pusty = analityka wyłączona). */
const GA_ID = ((import.meta.env.PUBLIC_GA_ID as string | undefined) || '').trim();

/** Tryb diagnostyczny - loguje zdarzenia w konsoli i włącza DebugView w GA4. */
const GA_DEBUG = /^(1|true|yes|on)$/i.test(
  ((import.meta.env.PUBLIC_GA_DEBUG as string | undefined) || '').trim()
);

export const isAnalyticsEnabled = (): boolean => GA_ID !== '';

/** Limit długości wartości parametru w GA4. */
const PARAM_VALUE_LIMIT = 100;

/** Usuwa puste wartości i przycina teksty do limitu GA4. */
function cleanParams(params: AnalyticsParams): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = typeof value === 'string' ? value.slice(0, PARAM_VALUE_LIMIT) : value;
  }
  return out;
}

/**
 * Surowe wywołanie gtag. Funkcję `gtag` definiuje wcześniej skrypt w <head>,
 * więc kolejka `dataLayer` działa również zanim gtag.js zdąży się załadować.
 *
 * Świadomie bez sprawdzania zgody - tą drogą idą właśnie sygnały Consent Mode.
 * Do zdarzeń służy `trackEvent`.
 */
export function gtag(...args: unknown[]): void {
  if (typeof window === 'undefined') return;

  if (GA_DEBUG) console.debug('[analytics]', ...args);

  const fn = window.gtag;
  if (typeof fn === 'function') fn(...args);
}

/**
 * Wysyła zdarzenie GA4. Bez skonfigurowanego strumienia nie ma dokąd - wtedy
 * wywołanie nic nie robi. Zgody tu nie sprawdzamy: przy stanie odmownym
 * gtag.js sam wyśle trafienie bezciasteczkowe, bez `_ga` i bez identyfikatora.
 *
 * `send_to` jest tu istotne. Bez niego gtag rozsyła zdarzenie do **wszystkich**
 * miejsc docelowych podpiętych pod tag Google - także do kont Google Ads, gdzie
 * ląduje jako trafienie remarketingowe. Tag taxun.pl ma dwa takie konta, w tym
 * jedno, którego nie konfigurujemy w kodzie, więc bez zawężenia wyciekałaby
 * tam cała aktywność w serwisie. Konwersja i tak nie potrzebuje tej drogi:
 * do Google Ads trafia importem kluczowego zdarzenia z GA4.
 */
export function trackEvent(name: string, params: AnalyticsParams = {}): void {
  if (!isAnalyticsEnabled()) return;
  gtag('event', name, { ...cleanParams(params), send_to: GA_ID });
}

/* ── Formularze ──────────────────────────────────────────────────────────── */

/**
 * Zgłoszenie przyjęte przez serwer - konwersja.
 *
 * `form_name` rozróżnia kreator wyceny od formularza kontaktowego, więc
 * w Google Ads wystarczy jedna akcja konwersji na oba. Źródło ruchu doklejamy
 * do zdarzenia, dzięki czemu konwersję da się rozbić na kanały bez opierania
 * się wyłącznie na modelu atrybucji GA4.
 */
export function trackLead(formName: string, params: AnalyticsParams = {}): void {
  trackEvent(LEAD_EVENT, {
    form_name: formName,
    // Waluta ma sens tylko razem z kwotą - Google Ads bierze obie z tego
    // zdarzenia, gdy akcja konwersji jest ustawiona na wartość z GA4.
    currency: typeof params.value === 'number' ? 'PLN' : undefined,
    ...trafficSourceParams(),
    ...params,
  });
}

/**
 * Kliknięcie w numer telefonu - konwersja.
 *
 * Samej rozmowy nie zmierzymy, ale sięgnięcie po słuchawkę niesie tę samą
 * intencję co wysłanie formularza, więc liczymy je tak samo. Źródło ruchu
 * doklejamy z tego samego powodu co przy zgłoszeniach.
 */
export function trackPhoneClick(params: AnalyticsParams = {}): void {
  trackEvent(PHONE_EVENT, { ...trafficSourceParams(), ...params });
}

/** Wysyłka odrzucona - kod błędu jest ten sam co w `form-client.ts`. */
export const trackFormError = (formName: string, errorCode: string): void =>
  trackEvent(FORM_ERROR_EVENT, { form_name: formName, error_code: errorCode });
