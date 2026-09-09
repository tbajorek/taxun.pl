/**
 * Odczyt zmiennych środowiskowych po stronie serwera.
 *
 * Wartości czytamy z obu źródeł. `import.meta.env` działa, gdy wartość jest
 * znana w czasie budowania, `process.env` - gdy pojawia się dopiero
 * w środowisku uruchomieniowym (np. zmiana sekretu w panelu Vercela bez
 * ponownego wdrożenia).
 *
 * Uwaga: moduł jest przeznaczony wyłącznie dla kodu serwerowego. W paczce
 * klienckiej dostępne są tylko zmienne z prefiksem `PUBLIC_`, które Astro
 * wstawia bezpośrednio przez `import.meta.env.PUBLIC_*`.
 */

/** Wartość dokładnie taka, jaka stoi w konfiguracji - bez sprzątania. */
const rawEnv = (key: string): string | undefined => {
  const fromImport = (import.meta.env as Record<string, unknown>)[key];
  if (typeof fromImport === 'string' && fromImport !== '') return fromImport;
  const fromProcess = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  return typeof fromProcess === 'string' && fromProcess !== '' ? fromProcess : undefined;
};

/** Zdejmuje cudzysłowy, w które panele hostingów lubią ubierać wartość. */
export const stripQuotes = (value: string): string =>
  value.length > 1 &&
  ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ? value.slice(1, -1).trim()
    : value;

/**
 * Wartość zmiennej po sprzątnięciu pomyłek, które zdarzają się przy wklejaniu
 * konfiguracji do panelu hostingu: białych znaków, cudzysłowów i całej linii
 * z pliku `.env` razem z nazwą zmiennej (`EMAIL_TO=biuro@...`).
 */
export const env = (key: string): string | undefined => {
  const raw = rawEnv(key);
  if (raw === undefined) return undefined;
  let value = stripQuotes(raw.trim());
  const assignment = new RegExp(`^${key}\\s*=\\s*`, 'i');
  if (assignment.test(value)) value = stripQuotes(value.replace(assignment, '').trim());
  return value === '' ? undefined : value;
};

/** Pierwsza ustawiona zmienna z listy - kolejność wyznacza pierwszeństwo. */
export const envAny = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = env(key);
    if (value !== undefined) return value;
  }
  return undefined;
};

