/**
 * Skąd przyszedł użytkownik.
 *
 * GA4 sam przypisuje sesję do źródła ruchu, ale to przypisanie żyje wyłącznie
 * w raportach pozyskiwania - nie da się go dołożyć do konkretnego zdarzenia.
 * Żeby dało się odpowiedzieć na pytanie "z jakiego źródła przyszły zgłoszenia
 * z kreatora wyceny", zapamiętujemy źródło pierwszego wejścia w sesji i
 * doklejamy je do zdarzeń próby kontaktu (`generate_lead`, `phone_click`).
 *
 * Zapis trzymamy w `sessionStorage` i tylko wtedy, gdy użytkownik zgodził się
 * na analitykę - bez zgody nic nie zapisujemy w przeglądarce. Gdy zgoda pojawi
 * się w trakcie wizyty, źródło wyliczamy z tego, co jest dostępne w tym
 * momencie; wcześniejszych kroków nie odtwarzamy, bo nie wolno nam ich było
 * przechowywać.
 *
 * Lokalizacji nie mierzymy tutaj samodzielnie - kraj, region i miasto GA4
 * wylicza z adresu IP i pokazuje w raportach "Dane demograficzne → Lokalizacja"
 * bez żadnego kodu po naszej stronie.
 */

const STORAGE_KEY = 'taxun-source-v1';

/** Wyszukiwarki rozpoznawane jako ruch organiczny (reszta to zwykłe odesłanie). */
const SEARCH_ENGINES = [
  'google',
  'bing',
  'yahoo',
  'duckduckgo',
  'ecosia',
  'yandex',
  'baidu',
  'brave',
  'startpage',
];

export interface TrafficSource {
  /** Domena albo `utm_source`, np. `google`, `facebook.com`, `(direct)`. */
  source: string;
  /** `organic`, `referral`, `cpc`, `(none)` albo wartość z `utm_medium`. */
  medium: string;
  campaign?: string;
  /** Ścieżka, na którą użytkownik wszedł jako pierwszą w tej sesji. */
  landingPage: string;
}

/** Czy wolno nam cokolwiek zapisać w przeglądarce na potrzeby analityki. */
function analyticsGranted(): boolean {
  return Boolean(window.taxunConsent?.has('analytics'));
}

/** Host odsyłający albo null, gdy odesłania nie ma lub pochodzi z tej samej domeny. */
function externalReferrerHost(): string | null {
  if (!document.referrer) return null;
  try {
    const url = new URL(document.referrer);
    if (url.hostname === location.hostname) return null;
    return url.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Wylicza źródło ruchu z adresu strony i odesłania. */
function detect(): TrafficSource {
  const params = new URLSearchParams(location.search);
  const landingPage = location.pathname;

  const utmSource = params.get('utm_source');
  if (utmSource) {
    return {
      source: utmSource,
      medium: params.get('utm_medium') || 'referral',
      campaign: params.get('utm_campaign') || undefined,
      landingPage,
    };
  }

  // Kliknięcie z reklamy Google - identyfikator jest w adresie, bo przy braku
  // zgody marketingowej Google nie zapisuje go w ciasteczku (`url_passthrough`).
  if (params.has('gclid') || params.has('gbraid') || params.has('wbraid')) {
    return { source: 'google', medium: 'cpc', landingPage };
  }

  const host = externalReferrerHost();
  if (host) {
    const engine = SEARCH_ENGINES.find((name) => host === name || host.startsWith(`${name}.`));
    return engine
      ? { source: engine, medium: 'organic', landingPage }
      : { source: host, medium: 'referral', landingPage };
  }

  // Wejście bezpośrednie albo przejście wewnątrz serwisu (przy wejściu na
  // kolejną podstronę odesłanie wskazuje na nas samych i nic nie wnosi).
  return { source: '(direct)', medium: '(none)', landingPage };
}

/**
 * Źródło pierwszego wejścia w tej sesji. Pierwsze wywołanie po zgodzie zapisuje
 * wynik, kolejne go odczytują - dzięki temu zgłoszenie wysłane na piątej
 * podstronie nadal wie, że wizyta zaczęła się od wyszukiwarki.
 */
export function trafficSource(): TrafficSource {
  if (typeof window === 'undefined') return { source: '(direct)', medium: '(none)', landingPage: '/' };

  if (!analyticsGranted()) return detect();

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as TrafficSource;
  } catch {
    // Brak dostępu do sessionStorage - liczymy źródło za każdym razem od nowa.
  }

  const detected = detect();
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(detected));
  } catch {
    // Zapis nieudany - nic nie szkodzi, źródło policzymy ponownie.
  }
  return detected;
}

/** Parametry źródła ruchu doklejane do zdarzeń lejka. */
export function trafficSourceParams(): Record<string, string | undefined> {
  const source = trafficSource();
  return {
    traffic_source: source.source,
    traffic_medium: source.medium,
    traffic_campaign: source.campaign,
    landing_page: source.landingPage,
  };
}

/**
 * Zapamiętuje źródło wejścia przy każdym wczytaniu strony, a nie dopiero przy
 * wysyłce formularza - inaczej `landing_page` wskazywałby stronę formularza
 * zamiast tej, od której zaczęła się wizyta. Bez zgody czekamy na decyzję
 * z banera; zgoda wyrażona w trakcie wizyty zapisuje źródło od bieżącej
 * podstrony, bo wcześniejszych kroków nie wolno nam było przechowywać.
 *
 * Wywoływane raz, z `BaseLayout`.
 */
export function initTrafficSource(): void {
  if (typeof window === 'undefined') return;

  if (analyticsGranted()) {
    trafficSource();
    return;
  }

  const unsubscribe = window.taxunConsent?.onChange(() => {
    if (!analyticsGranted()) return;
    unsubscribe?.();
    trafficSource();
  });
}
