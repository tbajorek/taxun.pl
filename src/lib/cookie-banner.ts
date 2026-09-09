/**
 * Obsługa banera zgód po stronie przeglądarki.
 *
 * Kod mieszkał wcześniej w `<script>` komponentu `CookieConsent.astro`. Każdy
 * taki znacznik to osobny punkt wejścia bundlera, czyli osobne żądanie i - bo
 * baner dzielił silnik zgód z resztą warstwy klienckiej - dodatkowy wspólny
 * plik doładowywany dopiero po sparsowaniu punktu wejścia. Warstwę kliencką
 * uruchamiamy więc z jednego skryptu w `BaseLayout.astro`, a tutaj zostaje samo
 * zachowanie banera. Znaczniki i style dalej opisuje komponent.
 *
 * Import `./consent` gwarantuje, że silnik (`window.taxunConsent`) jest gotowy,
 * zanim sprawdzimy zapisane preferencje.
 */
import './consent';

export function initCookieBanner(): void {
  const banner = document.getElementById('cookie-consent-banner');
  const modal = document.getElementById('cookie-consent-modal');

  // Strona bez banera (np. podgląd komponentu) nie ma czego uruchamiać.
  if (!banner && !modal) return;

  let focusBeforeModal: HTMLElement | null = null;

  /*
   * Baner jest widoczny od pierwszej klatki, jeżeli dokument ma
   * `data-consent="none"` (ustawia to skrypt w CookieConsent.astro). Tutaj
   * zostaje samo znikanie: klasa uruchamia przejście, a po nim atrybut na
   * dokumencie chowa baner na dobre - ta sama droga, którą chowa go od razu
   * u osoby z zapisaną wcześniej zgodą.
   */
  function hideBanner() {
    if (!banner || banner.classList.contains('is-leaving')) return;
    banner.classList.add('is-leaving');
    setTimeout(() => {
      document.documentElement.dataset.consent = 'set';
      banner.classList.remove('is-leaving');
    }, 300);
  }

  function showModal() {
    focusBeforeModal = document.activeElement as HTMLElement;
    modal?.classList.add('is-visible');
    setTimeout(() => {
      const firstInput = modal?.querySelector('input:not([disabled])') as HTMLElement;
      firstInput?.focus();
    }, 10);
    document.body.style.overflow = 'hidden';
  }

  function hideModal() {
    modal?.classList.remove('is-visible');
    document.body.style.overflow = '';
    setTimeout(() => {
      focusBeforeModal?.focus();
    }, 300);
  }

  function syncToggles() {
    const state = window.taxunConsent?.get();
    if (!state) return;

    const toggles = modal?.querySelectorAll<HTMLInputElement>('input[data-category]');
    toggles?.forEach((toggle) => {
      const cat = toggle.dataset.category as keyof typeof state.choices;
      if (cat && !toggle.disabled) {
        toggle.checked = state.choices[cat];
      }
    });
  }

  function saveFromToggles() {
    const toggles = modal?.querySelectorAll<HTMLInputElement>('input[data-category]:not([disabled])');
    const choices: Record<string, boolean> = {};

    toggles?.forEach((toggle) => {
      const cat = toggle.dataset.category;
      if (cat) {
        choices[cat] = toggle.checked;
      }
    });

    window.taxunConsent?.set(choices);
    hideBanner();
    hideModal();
  }

  // Event delegation
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const button = target.closest('[data-action]') as HTMLElement;
    if (!button) return;

    const action = button.dataset.action;

    if (action === 'accept') {
      window.taxunConsent?.accept();
      hideBanner();
      hideModal();
    } else if (action === 'reject') {
      window.taxunConsent?.reject();
      hideBanner();
      hideModal();
    } else if (action === 'preferences') {
      syncToggles();
      showModal();
    } else if (action === 'save') {
      saveFromToggles();
    } else if (action === 'close') {
      hideModal();
    }
  });

  // ESC to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('is-visible')) {
      hideModal();
    }
  });

  // Listen for open event
  window.addEventListener('taxun:consent:open', () => {
    syncToggles();
    showModal();
  });

}
