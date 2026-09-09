/**
 * Jedyny automatyczny nasłuch zdarzeń w serwisie: kliknięcia w numer telefonu.
 *
 * Formularze mają własną, wyraźną ścieżkę wysyłki (`lib/form-client.ts`), więc
 * zgłaszają się same. Telefon jest inny: numer stoi w stopce, w sekcjach CTA,
 * na stronie kontaktu, w kreatorze wyceny i na podstronach branżowych - a lista
 * będzie rosła. Zamiast tagować każde z tych miejsc z osobna, słuchamy kliknięć
 * na poziomie dokumentu i wyłapujemy każdy odnośnik `tel:`, również ten dodany
 * do serwisu jutro.
 *
 * Przejścia nie odraczamy. Odnośnik `tel:` nie opuszcza strony - przekazuje
 * numer do aplikacji telefonu, a dokument zostaje wczytany, więc zdarzenie ma
 * czas polecieć. To różnica wobec zwykłego linku, przy którym trzeba czekać na
 * potwierdzenie wysyłki, zanim przeglądarka zmieni adres.
 *
 * Selektor jest celowo szerszy niż dzisiejsza treść serwisu. `tel://` pasuje
 * do niego samo (zaczyna się od `tel:`), ale przydają się dwie rzeczy, których
 * dopasowanie atrybutu nie robi domyślnie: flaga `i`, bo wartości atrybutów
 * porównuje się z uwzględnieniem wielkości liter i `TEL:` przeszłoby bokiem,
 * oraz `callto:`, spotykane w odnośnikach wklejanych z zewnątrz. Nietrafiony
 * odnośnik nie zgłasza błędu - po prostu po cichu nie liczy próby kontaktu,
 * a takich cichych ubytków wolimy unikać.
 */

/** Odnośniki uznawane za "zadzwoń". Patrz komentarz powyżej. */
const PHONE_SELECTOR = 'a[href^="tel:" i], a[href^="callto:" i]';

import { isAnalyticsEnabled, trackPhoneClick } from './analytics';

/** Etykieta klikniętego elementu - po niej poznamy, który przycisk działa. */
function linkLabel(link: HTMLAnchorElement): string {
  return (link.textContent ?? '').trim().replace(/\s+/g, ' ');
}

function handleClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (!target || typeof target.closest !== 'function') return;

  const link = target.closest<HTMLAnchorElement>(PHONE_SELECTOR);
  if (!link) return;

  trackPhoneClick({
    link_url: link.getAttribute('href') ?? undefined,
    link_text: linkLabel(link) || undefined,
    // Podstrona, z której dzwoniono - pokazuje, które treści generują telefony.
    from_page: window.location.pathname,
  });
}

let initialized = false;

/** Podpina nasłuch kliknięć w telefon. Wywoływane raz, z `BaseLayout`. */
export function initContactTracking(): void {
  if (initialized || typeof window === 'undefined' || !isAnalyticsEnabled()) return;
  initialized = true;

  // Faza przechwytywania: zdarzenie łapiemy, zanim jakikolwiek kod na stronie
  // zdąży zatrzymać jego propagację.
  document.addEventListener('click', handleClick, true);
}
