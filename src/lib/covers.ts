import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Zdjęcia wyróżniające artykułów (cover photo).
 *
 * Źródłem prawdy jest pole `cover` we frontmatterze artykułu - nazwa pliku
 * wrzuconego do `public/posts/`, np. `cover: "jdg-najem.png"`. Ta warstwa
 * zamienia ją na komplet danych do `<picture>`: warianty AVIF/WebP w kilku
 * szerokościach oraz wymiary oryginału (do rezerwacji miejsca w layoucie).
 *
 * Pliki przygotowuje `scripts/optimize-covers.mjs`. Oryginał nie jest
 * commitowany - po przetworzeniu ląduje w `.originals/`, poza gitem - więc
 * żaden adres na stronie nie może na niego wskazywać. Awaryjny `<img src>`
 * i obrazek Open Graph też pochodzą z manifestu.
 */

const SOURCE_DIR = 'public/posts';
const MANIFEST_PATH = join(SOURCE_DIR, '_optimized', 'manifest.json');

interface Variant {
  width: number;
  src: string;
}

/** Plik o znanych wymiarach - awaryjny JPEG albo obrazek Open Graph. */
interface Rendition {
  src: string;
  width: number;
  height: number;
}

interface ManifestEntry {
  hash: string;
  width: number;
  height: number;
  fallback: Rendition;
  og: Rendition;
  variants: Record<string, Variant[]>;
}

interface Manifest {
  version: number;
  covers: Record<string, ManifestEntry>;
}

export interface Cover {
  /** JPEG dla przeglądarek bez AVIF i bez WebP - stoi w `<img src>`. */
  src: string;
  /** Wymiary oryginału: wyznaczają proporcję kadru, więc i rezerwację miejsca. */
  width: number;
  height: number;
  /** Warianty w kolejności od najlepiej kompresującego formatu. */
  sources: { type: string; srcset: string }[];
  /** Kadr 1200x630 dla podglądu linku - proporcji oczekiwanej przez serwisy. */
  og: Rendition;
  alt: string;
}

const MIME_BY_EXT: Record<string, string> = {
  avif: 'image/avif',
  webp: 'image/webp',
};

/**
 * Manifest czytamy raz na proces. W trybie dev skrypt uruchamia się przed
 * serwerem, więc plik jest już na miejscu; nowe zdjęcie wymaga restartu dev
 * serwera (`npm run dev`), bo dopiero wtedy powstają jego warianty.
 */
let manifestCache: Record<string, ManifestEntry> | null = null;

function loadManifest(): Record<string, ManifestEntry> {
  if (manifestCache) return manifestCache;
  if (!existsSync(MANIFEST_PATH)) {
    manifestCache = {};
    return manifestCache;
  }
  try {
    manifestCache = (JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest).covers ?? {};
  } catch {
    manifestCache = {};
  }
  return manifestCache;
}

/** Lista dostępnych plików - używana wyłącznie w komunikacie o błędzie. */
function availableCovers(): string {
  const names = Object.keys(loadManifest());
  return names.length ? names.join(', ') : '(katalog jest pusty)';
}

/**
 * Zdjęcie wskazane przez artykuł albo `null`, jeśli artykuł go nie ma.
 *
 * Nieistniejący plik przerywa build, zamiast po cichu wyrenderować artykuł bez
 * zdjęcia. Literówka w nazwie jest inaczej niewidoczna: strona wygląda
 * poprawnie, tylko zamiast zdjęcia zostaje gradient - i nikt tego nie zauważa
 * aż do momentu, w którym artykuł jest już opublikowany.
 */
export function getCover(
  name: string | undefined,
  alt: string,
  context: string
): Cover | null {
  if (!name) return null;

  const fileName = name.trim();
  if (!fileName) return null;

  // Nazwa pliku, nie ścieżka - katalog jest jeden i płaski.
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    throw new Error(
      `${context} wskazuje w polu \`cover\` wartość ${JSON.stringify(name)}. ` +
        `Oczekujemy samej nazwy pliku z katalogu ${SOURCE_DIR}/, bez ścieżki, np. "moje-zdjecie.jpg".`
    );
  }

  const entry = loadManifest()[fileName];
  if (!entry) {
    const waiting = existsSync(join(SOURCE_DIR, fileName));
    throw new Error(
      waiting
        ? `${context} wskazuje zdjęcie "${fileName}", które leży w ${SOURCE_DIR}/, ale nie zostało ` +
          'jeszcze przetworzone. Uruchom `npm run covers`.'
        : `${context} wskazuje zdjęcie "${fileName}", którego nie ma w manifeście. ` +
          `Wrzuć oryginał do ${SOURCE_DIR}/ i uruchom \`npm run covers\`. ` +
          `Dostępne zdjęcia: ${availableCovers()}.`
    );
  }

  const sources = Object.entries(entry.variants)
    .filter(([ext, variants]) => MIME_BY_EXT[ext] && variants.length > 0)
    .map(([ext, variants]) => ({
      type: MIME_BY_EXT[ext],
      srcset: variants.map((v) => `${v.src} ${v.width}w`).join(', '),
    }));

  return {
    src: entry.fallback.src,
    width: entry.width,
    height: entry.height,
    sources,
    og: entry.og,
    alt,
  };
}

/**
 * Bezwzględny adres kadru do podglądu linku - dla Open Graph i danych
 * strukturalnych. Nie jest to ten sam plik, co awaryjny `<img src>`:
 * serwisy społecznościowe kadrują do 1,91:1, a pionowe zdjęcie przycięłyby
 * po swojemu, zwykle przez środek twarzy.
 */
export function coverUrl(cover: Cover | null, siteUrl: string): string | null {
  return cover ? new URL(cover.og.src, siteUrl).toString() : null;
}
