/**
 * Declarative registry for third-party integrations.
 * Each integration declares its consent category and load/unload logic.
 * Adding a new tool = appending one object to this array.
 *
 * Baner jest jedynym włącznikiem narzędzi zewnętrznych. Każdy wpis opisuje
 * trzy rzeczy i tylko one decydują o tym, co dzieje się w przeglądarce:
 *
 *   • `signal`  - przekazanie decyzji do narzędzia (Consent Mode u Google),
 *   • `start`   - uruchomienie narzędzia; wywoływane wyłącznie po zgodzie,
 *   • `cleanup` - sprzątanie po kategorii bez zgody (również przy starcie strony).
 *
 * Narzędzia Google działają w zaawansowanym trybie zgody (Consent Mode v2):
 * tag jest konfigurowany przy każdym wejściu (`components/GoogleTag.astro`),
 * a decyduje sam sygnał zgody. Dlatego wpisy Google mają tylko `signal`
 * i `cleanup` - nie ma czego "uruchamiać", bo tag już działa, tyle że przy
 * odmowie bez ciasteczek i identyfikatorów. Narzędzia spoza rodziny Google
 * (Vercel Speed Insights) nie mają trybu zgody i te uruchamiamy dopiero
 * po decyzji, więc korzystają z `start`.
 *
 * Sygnałów nie powtarzamy przy starcie strony: stan zgody ustawia już skrypt
 * w <head>, czytający ten sam wpis w localStorage. Zostaje wtedy uruchomienie
 * narzędzi z przyznanych kategorii i sprzątanie po odrzuconych.
 */

import type { ConsentCategory } from './consent';
import { gtag } from './analytics';

export interface Integration {
  id: string;
  category: ConsentCategory;
  /** Przekazuje decyzję użytkownika do narzędzia (Consent Mode). */
  signal: (granted: boolean) => void;
  /** Uruchamia narzędzie. Wywoływane tylko po zgodzie; musi być idempotentne. */
  start?: () => void;
  /** Sprzątanie po kategorii bez zgody - wykonywane też przy starcie strony. */
  cleanup?: () => void;
}

/** Usuwa ciasteczka o podanym prefiksie ze wszystkich ścieżek i domen. */
function clearCookies(prefix: string): void {
  const names = document.cookie
    .split(';')
    .map((c) => c.trim().split('=')[0])
    .filter((name) => name.startsWith(prefix));

  if (names.length === 0) return;

  // Ciasteczka GA zapisywane są na domenie nadrzędnej (.taxun.pl), więc samo
  // wyczyszczenie na bieżącym hoście nie zawsze wystarcza.
  const host = location.hostname;
  const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`];

  for (const name of names) {
    for (const domain of domains) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;${domain ? ` domain=${domain};` : ''}`;
    }
  }
}

/**
 * Uruchamia Vercel Speed Insights. Biblioteka jest dociągana dynamicznie, więc
 * bez zgody nie trafia nawet do pobranej paczki JavaScriptu. Dane o trasie
 * zostawia w dokumencie `components/SpeedInsights.astro`.
 */
let speedInsightsStarted = false;
function startSpeedInsights(): void {
  if (speedInsightsStarted) return;
  speedInsightsStarted = true;

  const marker = document.getElementById('speed-insights');
  const pathname = marker?.dataset.pathname ?? location.pathname;

  let params: Record<string, string | string[]> = {};
  try {
    params = JSON.parse(marker?.dataset.params ?? '{}');
  } catch {
    // Brak danych o trasie - Vercel zaraportuje surowy adres strony.
  }

  void import('@vercel/speed-insights').then(({ injectSpeedInsights, computeRoute }) => {
    injectSpeedInsights({ framework: 'astro', route: computeRoute(pathname, params) });
  });
}

export const integrations: Integration[] = [
  {
    // Google Analytics 4 - pomiar ruchu i zdarzeń.
    id: 'ga4',
    category: 'analytics',
    signal: (granted) => {
      gtag('consent', 'update', { analytics_storage: granted ? 'granted' : 'denied' });
    },
    // Po odmowie Google nie zapisze nowych ciasteczek, ale te z wcześniejszej
    // zgody trzeba posprzątać samemu.
    cleanup: () => clearCookies('_ga'),
  },
  {
    // Google Ads - łącznik konwersji, czyli ciasteczka _gcl_* wiążące
    // kliknięcie w reklamę ze zgłoszeniem. Bez zgody marketingowej Google ich
    // nie zapisuje i nie użyje danych do rozliczenia kampanii.
    id: 'google-ads',
    category: 'marketing',
    signal: (granted) => {
      const value = granted ? 'granted' : 'denied';
      gtag('consent', 'update', {
        ad_storage: value,
        ad_user_data: value,
        ad_personalization: value,
        personalization_storage: value,
      });
    },
    cleanup: () => clearCookies('_gcl'),
  },
  {
    // Vercel Speed Insights - Core Web Vitals prawdziwych użytkowników.
    // Nie używa ciasteczek i nie ma trybu zgody, więc jedyną kontrolą jest to,
    // czy w ogóle go uruchomimy.
    id: 'vercel-speed-insights',
    category: 'analytics',
    signal: () => {},
    start: startSpeedInsights,
  },
];

/**
 * Bootstrap function - subscribes to consent changes and routes load/unload.
 * Call once from BaseLayout after consent engine is loaded.
 */
export function bootstrapIntegrations(): void {
  if (!window.taxunConsent) {
    console.warn('[consent-integrations] taxunConsent not available');
    return;
  }

  const apply = (options: { signals: boolean }) => {
    for (const integration of integrations) {
      const granted = window.taxunConsent.has(integration.category);
      if (options.signals) integration.signal(granted);
      if (granted) integration.start?.();
      else integration.cleanup?.();
    }
  };

  // Start strony: sygnały zgody ustawił już skrypt w <head> z tego samego
  // źródła, więc zostaje uruchomienie narzędzi i sprzątanie ciasteczek.
  apply({ signals: false });

  // Każda zmiana decyzji trafia do narzędzi od razu - również wycofanie zgody.
  window.taxunConsent.onChange(() => {
    apply({ signals: true });
  });
}
