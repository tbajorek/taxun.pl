/**
 * Universal consent engine for Taxun.pl
 * Manages user cookie/tracking preferences with versioned storage,
 * event-driven updates, and a declarative category system.
 */

export const CONSENT_VERSION = 1;
export const STORAGE_KEY = `taxun-consent-v${CONSENT_VERSION}`;

/**
 * Jak długo pamiętamy decyzję użytkownika. Zgoda nie może być bezterminowa -
 * po tym czasie baner pyta ponownie, a do momentu odpowiedzi obowiązuje
 * domyślna odmowa. Ta sama wartość jest zapisana w tabeli ciasteczek
 * w banerze ("1 rok"), więc zmiana musi objąć oba miejsca.
 */
export const CONSENT_TTL_DAYS = 365;
export const CONSENT_TTL_MS = CONSENT_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Czy zapisana decyzja jest jeszcze ważna (wersja się zgadza i nie wygasła). */
export function isStoredConsentValid(stored: { version?: number; timestamp?: number } | null): boolean {
  if (!stored || stored.version !== CONSENT_VERSION) return false;
  if (typeof stored.timestamp !== 'number') return false;
  return Date.now() - stored.timestamp < CONSENT_TTL_MS;
}

export const CONSENT_CATEGORIES = {
  necessary: { required: true, default: true },
  analytics: { required: false, default: false },
  marketing: { required: false, default: false },
} as const;

export type ConsentCategory = keyof typeof CONSENT_CATEGORIES;

export interface ConsentState {
  version: number;
  timestamp: number;
  choices: Record<ConsentCategory, boolean>;
}

class ConsentEngine {
  private state: ConsentState | null = null;
  private listeners: Set<(state: ConsentState) => void> = new Set();

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const stored = JSON.parse(raw) as ConsentState;
      // Stara wersja zapisu albo wygasła zgoda - kasujemy wpis i pytamy od nowa.
      if (!isStoredConsentValid(stored)) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      this.state = stored;
    } catch {
      // Invalid storage, ignore
    }
  }

  private save(choices: Record<ConsentCategory, boolean>): void {
    this.state = {
      version: CONSENT_VERSION,
      timestamp: Date.now(),
      choices,
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Storage failed, continue anyway
    }

    this.notify();
  }

  private notify(): void {
    if (!this.state) return;

    this.listeners.forEach((fn) => fn(this.state!));

    window.dispatchEvent(
      new CustomEvent('taxun:consent', {
        detail: this.state,
      })
    );
  }

  get(): ConsentState | null {
    return this.state;
  }

  has(category: ConsentCategory): boolean {
    if (!this.state) {
      return CONSENT_CATEGORIES[category].default;
    }
    return this.state.choices[category] ?? CONSENT_CATEGORIES[category].default;
  }

  set(choices: Partial<Record<ConsentCategory, boolean>>): void {
    const current = this.state?.choices ?? this.getDefaults();
    const updated = { ...current };

    for (const [key, value] of Object.entries(choices)) {
      const cat = key as ConsentCategory;
      if (cat in CONSENT_CATEGORIES && !CONSENT_CATEGORIES[cat].required) {
        updated[cat] = value;
      }
    }

    this.save(updated);
  }

  accept(): void {
    const choices = this.getDefaults();
    for (const cat of Object.keys(CONSENT_CATEGORIES) as ConsentCategory[]) {
      if (!CONSENT_CATEGORIES[cat].required) {
        choices[cat] = true;
      }
    }
    this.save(choices);
  }

  reject(): void {
    const choices = this.getDefaults();
    for (const cat of Object.keys(CONSENT_CATEGORIES) as ConsentCategory[]) {
      if (!CONSENT_CATEGORIES[cat].required) {
        choices[cat] = false;
      }
    }
    this.save(choices);
  }

  onChange(fn: (state: ConsentState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  waitFor(category: ConsentCategory): Promise<boolean> {
    if (this.state) {
      return Promise.resolve(this.has(category));
    }

    return new Promise((resolve) => {
      const unsubscribe = this.onChange(() => {
        unsubscribe();
        resolve(this.has(category));
      });
    });
  }

  private getDefaults(): Record<ConsentCategory, boolean> {
    const defaults: Record<string, boolean> = {};
    for (const [cat, config] of Object.entries(CONSENT_CATEGORIES)) {
      defaults[cat] = config.default;
    }
    return defaults as Record<ConsentCategory, boolean>;
  }
}

// Singleton instance
let engine: ConsentEngine | null = null;

// Global API
declare global {
  interface Window {
    // Instancja silnika współdzielona przez wszystkie kopie tego modułu
    // (bundler może załadować go osobno dla każdego skryptu strony).
    __taxunConsentEngine?: unknown;
    taxunConsent: {
      get(): ConsentState | null;
      has(category: ConsentCategory): boolean;
      set(choices: Partial<Record<ConsentCategory, boolean>>): void;
      accept(): void;
      reject(): void;
      open(): void;
      onChange(fn: (state: ConsentState) => void): () => void;
      waitFor(category: ConsentCategory): Promise<boolean>;
    };
  }
}

// Only initialize in browser
if (typeof window !== 'undefined') {
  // Jedna instancja na dokument - kolejne importy modułu odzyskują tę samą,
  // dzięki czemu baner i integracje czytają/zapisują ten sam stan.
  engine = (window.__taxunConsentEngine as ConsentEngine | undefined) ?? new ConsentEngine();
  window.__taxunConsentEngine = engine;

  window.taxunConsent = {
    get: () => engine!.get(),
    has: (cat) => engine!.has(cat),
    set: (choices) => engine!.set(choices),
    accept: () => engine!.accept(),
    reject: () => engine!.reject(),
    open: () => {
      window.dispatchEvent(new CustomEvent('taxun:consent:open'));
    },
    onChange: (fn) => engine!.onChange(fn),
    waitFor: (cat) => engine!.waitFor(cat),
  };
}

export default engine;
