/**
 * Wspólna obsługa wysyłki formularzy po stronie przeglądarki.
 *
 * Moduł trafia do paczki klienckiej, więc nie może importować niczego z części
 * serwerowej. Odpowiada za cztery rzeczy, które inaczej powielałby każdy
 * formularz: token reCAPTCHA, pola antyspamowe (pułapka i czas wypełniania),
 * zamianę odpowiedzi serwera na komunikat po polsku oraz zdarzenia pomiarowe
 * GA4 - konwersję (`generate_lead`) i `lead_form_error` przy odrzuconej wysyłce.
 *
 * Konwersję zgłasza wyłącznie przeglądarka. Serwer nie raportuje jej własnym
 * kanałem, bo Protokół pomiarowy GA4 nie potwierdza zapisu - odpowiada tak
 * samo na zdarzenie przyjęte i po cichu odrzucone. Jedna droga zamiast dwóch
 * znaczy też, że konwersję widać w Tag Assistant i w raporcie czasu
 * rzeczywistego, więc da się ją sprawdzić bez zgadywania.
 */

import { trackFormError, trackLead } from './analytics';

type Grecaptcha = {
  ready: (cb: () => void) => void;
  execute: (siteKey: string, options: { action: string }) => Promise<string>;
};

/**
 * Pobiera token reCAPTCHA v3. Zwraca null, gdy klucz nie jest skonfigurowany
 * albo skrypt Google nie zdążył się załadować - serwer sam zdecyduje, czy w tej
 * konfiguracji token jest wymagany.
 */
export function getRecaptchaToken(siteKey: string | undefined, action: string): Promise<string | null> {
  const grecaptcha = (window as unknown as { grecaptcha?: Grecaptcha }).grecaptcha;
  if (!siteKey || !grecaptcha) return Promise.resolve(null);

  return new Promise((resolve) => {
    // Gdy skrypt Google jest zablokowany, obietnica nigdy by się nie rozwiązała
    // i formularz zostałby z zablokowanym przyciskiem.
    const timer = setTimeout(() => resolve(null), 8000);
    const done = (token: string | null) => {
      clearTimeout(timer);
      resolve(token);
    };
    try {
      grecaptcha.ready(() => {
        grecaptcha
          .execute(siteKey, { action })
          .then(done)
          .catch(() => done(null));
      });
    } catch {
      done(null);
    }
  });
}

export type FormResponse =
  | { ok: true }
  | { ok: false; code: string; message: string; fields?: Record<string, string> };

type ServerResponse = {
  ok?: boolean;
  error?: string;
  code?: string;
  fields?: Record<string, string>;
};

/** Komunikat dla użytkownika na podstawie kodu błędu zwróconego przez API. */
export function errorMessage(code: string, fallbackEmail: string): string {
  switch (code) {
    case 'not-configured':
      return `Wysyłka wiadomości jest chwilowo niedostępna. Napisz do nas na ${fallbackEmail} - odpowiemy tak samo szybko.`;
    case 'recaptcha':
      return 'Nie udało się potwierdzić, że zgłoszenie wysyła człowiek. Odśwież stronę i spróbuj ponownie.';
    case 'privacy':
      return 'Aby wysłać zgłoszenie, zaakceptuj politykę prywatności.';
    case 'bot':
      return 'Zgłoszenie zostało odrzucone przez filtr antyspamowy. Odczekaj chwilę i wyślij je ponownie.';
    case 'validation':
      return 'Sprawdź zaznaczone pola - kilku informacji jeszcze brakuje.';
    case 'network':
      return 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.';
    default:
      return `Nie udało się wysłać zgłoszenia. Spróbuj ponownie za chwilę lub napisz na ${fallbackEmail}.`;
  }
}

export type SubmitterOptions = {
  /** Adres API, np. "/api/contact". */
  endpoint: string;
  /** Nazwa akcji reCAPTCHA - musi zgadzać się z ustawioną na serwerze. */
  action: string;
  /** Klucz publiczny reCAPTCHA albo undefined, gdy mechanizm jest wyłączony. */
  siteKey?: string;
  /** Formularz - stąd czytamy pole-pułapkę. */
  form: HTMLFormElement;
  /** Adres podawany w komunikatach o błędzie. */
  fallbackEmail: string;
  /** Nazwa formularza w raportach GA4. Domyślnie taka sama jak akcja. */
  formName?: string;
  /**
   * Dodatkowe parametry konwersji (np. wybrany wariant). Liczbowe `value`
   * trafia do Google Ads jako wartość konwersji w złotych.
   */
  leadParams?: () => Record<string, string | number | boolean | undefined>;
};

/**
 * Tworzy funkcję wysyłającą zgłoszenie. Czas wypełniania liczymy od momentu
 * utworzenia, czyli od wyświetlenia formularza.
 */
export function createSubmitter(options: SubmitterOptions) {
  const startedAt = Date.now();
  const formName = options.formName ?? options.action;

  return async function submit(payload: Record<string, unknown>): Promise<FormResponse> {
    const honeypot = options.form.querySelector<HTMLInputElement>('input[name="website"]');
    const elapsed = Date.now() - startedAt;

    let data: ServerResponse;
    try {
      const res = await fetch(options.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          website: honeypot?.value ?? '',
          elapsed,
          source: location.href,
          recaptchaToken: await getRecaptchaToken(options.siteKey, options.action),
        }),
      });
      data = (await res.json()) as ServerResponse;
    } catch {
      trackFormError(formName, 'network');
      return { ok: false, code: 'network', message: errorMessage('network', options.fallbackEmail) };
    }

    if (data.ok) {
      const leadParams = options.leadParams?.();

      trackLead(formName, {
        // Czas wypełniania formularza w sekundach - przydaje się przy ocenie,
        // które kroki kreatora zniechęcają użytkowników.
        time_to_submit: Math.round(elapsed / 1000),
        ...leadParams,
      });

      return { ok: true };
    }

    const code = data.code ?? 'server';
    trackFormError(formName, code);
    return { ok: false, code, message: errorMessage(code, options.fallbackEmail), fields: data.fields };
  };
}
