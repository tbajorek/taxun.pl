/**
 * Grupowanie podstron na potrzeby raportów GA4.
 *
 * GA4 raportuje odsłony po adresie URL, więc bez dodatkowego opisu każda
 * podstrona jest osobnym wierszem, a pytanie "ile ruchu mają razem strony
 * branżowe" wymaga ręcznego sumowania. Wymiar `content_group` jest wbudowany
 * w GA4 - wystarczy go podać przy konfiguracji strumienia, a raporty
 * (Zaangażowanie → Strony i ekrany) dostają gotowy podział.
 *
 * Grupę wyliczamy na serwerze, ze ścieżki żądania, i wstawiamy do
 * `gtag('config', ...)` w `components/GoogleTag.astro`. Dzięki temu
 * pierwsza odsłona ma komplet danych - nie trzeba jej poprawiać z JavaScriptu.
 *
 * Lista branż pochodzi z `data/site.ts`, więc nowa podstrona branżowa trafia
 * do grupy "Branże" bez zmian w tym pliku.
 */

import { industries } from '../data/site';

/** Ścieżki podstron branżowych - jedno źródło prawdy razem z menu i sitemapą. */
const industryPaths = new Set(industries.map((item) => item.href));

export interface PageContext {
  /** Wbudowany wymiar GA4 - łączy podstrony w jedną pozycję raportu. */
  contentGroup: string;
  /** Slug branży (tylko na podstronach branżowych), np. `lekarzy`. */
  industry?: string;
}

/** Ujednolica ścieżkę: bez końcowego ukośnika, zawsze z początkowym. */
function normalize(pathname: string): string {
  const path = pathname.replace(/\/+$/, '');
  return path === '' ? '/' : path;
}

/**
 * Opisuje podstronę na podstawie jej ścieżki. Kolejność warunków ma znaczenie -
 * dopasowania dokładne idą przed prefiksami.
 */
export function pageContext(pathname: string): PageContext {
  const path = normalize(pathname);

  if (path === '/') return { contentGroup: 'Strona główna' };

  if (industryPaths.has(path)) {
    return {
      contentGroup: 'Branże',
      // `ksiegowosc-dla-branzy-beauty` → `beauty`, `ksiegowosc-dla-lekarzy` → `lekarzy`.
      industry: path.replace(/^\/ksiegowosc-dla-(branzy-)?/, ''),
    };
  }

  if (path === '/wycena') return { contentGroup: 'Kreator wyceny' };
  if (path === '/kontakt') return { contentGroup: 'Kontakt' };
  if (path === '/cennik') return { contentGroup: 'Cennik' };

  if (path === '/kalkulatory' || path.startsWith('/kalkulatory/')) {
    return { contentGroup: 'Kalkulatory' };
  }

  if (path === '/wiedza' || path.startsWith('/wiedza/')) {
    return { contentGroup: 'Wiedza' };
  }

  if (
    path === '/ksiegowosc'
    || path === '/ksiegowosc-online'
    || path === '/kadry-place'
    || path === '/biuro-rachunkowe-krakow'
  ) {
    return { contentGroup: 'Usługi' };
  }

  if (path === '/o-nas' || path === '/slownik') return { contentGroup: 'O nas' };

  if (path === '/polityka-prywatnosci' || path === '/regulamin') {
    return { contentGroup: 'Dokumenty' };
  }

  if (path === '/404') return { contentGroup: 'Błąd 404' };

  return { contentGroup: 'Pozostałe' };
}
