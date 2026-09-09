/// <reference path="../.astro/types.d.ts" />

/**
 * Zmienne środowiskowe używane przez stronę.
 *
 * Prefiks `PUBLIC_` oznacza wartość wstawianą do stron podczas budowania
 * (widoczną w przeglądarce). Pozostałe zmienne są dostępne wyłącznie po stronie
 * serwera - w trasach API i funkcjach Vercela.
 */
interface ImportMetaEnv {
  /** Połączenie SMTP w formacie DSN (nodemailer). */
  readonly EMAIL_DSN?: string;
  /** Adres, na który trafiają zgłoszenia z formularzy. */
  readonly EMAIL_TO?: string;
  /** Adres nadawcy wiadomości z formularzy. */
  readonly EMAIL_FROM?: string;

  /** Measurement ID Google Analytics 4 (G-XXXXXXXXXX). Puste = brak pomiaru. */
  readonly PUBLIC_GA_ID?: string;
  /** Tryb diagnostyczny GA4 - DebugView i logi w konsoli przeglądarki. */
  readonly PUBLIC_GA_DEBUG?: string;

  /**
   * Identyfikator konta Google Ads (AW-XXXXXXXXX). Puste = brak pomiaru
   * konwersji. Same zdarzenia opisuje rejestr `src/data/conversions.ts`.
   */
  readonly PUBLIC_GOOGLE_ADS_ID?: string;

  /** Klucz publiczny reCAPTCHA v3. */
  readonly PUBLIC_RECAPTCHA_SITE_KEY?: string;
  /** Klucz prywatny reCAPTCHA v3 - wyłącznie po stronie serwera. */
  readonly RECAPTCHA_SECRET_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
