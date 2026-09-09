import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import type { Loader, LoaderContext } from 'astro/loaders';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_AUTHOR_ID, TEAM_IDS } from './data/team';
import { BLOG_CONTENT_DIR, BLOG_CONTENT_EXT, BLOG_CONTENT_PATTERN } from './lib/content-paths';

/** Czy w katalogu (rekurencyjnie) jest choć jeden plik artykułu. */
function hasContentFiles(dir: string): boolean {
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir, { recursive: true, encoding: 'utf-8' })
      .some((entry) => entry.endsWith(BLOG_CONTENT_EXT));
  } catch {
    return false;
  }
}

/** Najbliższy istniejący katalog nadrzędny - chokidar nie obserwuje nieistniejących ścieżek. */
function nearestExistingDir(dir: string): string {
  let current = dir;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

/** Czy zmieniony plik leży w obserwowanym katalogu treści. */
function isInside(dir: string, changedPath: string): boolean {
  const rel = relative(dir, changedPath);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * glob() z Astro rejestruje obserwatory plików DOPIERO po znalezieniu co
 * najmniej jednego pasującego pliku (astro/dist/content/loaders/glob.js):
 *
 *     const files = await tinyglobby(pattern, { cwd: baseDir });
 *     if (exists && files.length === 0) {
 *       logger.warn(`No files found matching ...`);
 *       return;                      // <- wyjście PRZED watcher.add()/watcher.on('add')
 *     }
 *
 * Jeżeli dev serwer zsynchronizuje treści w momencie, gdy katalog artykułów jest
 * pusty lub go nie ma (przełączenie gałęzi, git stash, pull albo pierwszy start
 * przed pobraniem treści), kolekcja zostaje pusta do końca życia procesu:
 * późniejsze dodanie plików nie wywoła już re-syncu, bo nikt ich nie obserwuje.
 * Dodatkowo `npm run dev` tylko podłącza się do działającego w tle serwera
 * ("Dev server already running..."), więc nawet ponowne uruchomienie nie pomaga.
 * Build startuje w osobnym procesie i czyta pliki od nowa - dlatego artykuły
 * potrafiły zniknąć wyłącznie lokalnie, a na produkcji były widoczne.
 *
 * Ten wrapper dokłada brakujący obserwator: gdy przy starcie nie ma żadnego
 * artykułu, czeka na pojawienie się pierwszego pliku i ponawia pełny load -
 * wtedy właściwy loader zarejestruje już własne obserwatory i lista działa
 * normalnie, bez restartu serwera.
 */
function selfHealingGlob(options: { pattern: string; base: string }): Loader {
  const inner = glob(options);

  function armRescan(context: LoaderContext): void {
    const { config, watcher, logger } = context;
    // watcher istnieje tylko w trybie dev; w buildzie nie ma czego naprawiać.
    if (!watcher) return;

    const contentDir = fileURLToPath(new URL(options.base, config.root));
    // Pliki są - wbudowany loader zarejestrował własne obserwatory.
    if (hasContentFiles(contentDir)) return;

    watcher.add(nearestExistingDir(contentDir));

    const onAdd = async (changedPath: string) => {
      if (!changedPath.endsWith(BLOG_CONTENT_EXT) || !isInside(contentDir, changedPath)) return;
      watcher.off('add', onAdd);
      logger.info(`Pojawiły się pliki w ${options.base} - ponawiam synchronizację kolekcji.`);
      await inner.load(context);
      // Gdyby pliki znowu zniknęły, uzbrajamy nasłuch ponownie.
      armRescan(context);
    };

    watcher.on('add', onAdd);
  }

  return {
    name: 'self-healing-glob',
    load: async (context) => {
      await inner.load(context);
      armRescan(context);
    },
  };
}

const blog = defineCollection({
  loader: selfHealingGlob({ pattern: BLOG_CONTENT_PATTERN, base: BLOG_CONTENT_DIR }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /*
     * Krótsze warianty wyłącznie dla znaczników meta. Tytuł artykułu i lead są
     * pisane pod czytelnika i bywają dłuższe, niż Google zdąży pokazać (limit
     * to ok. 580 px tytułu i 1000 px opisu). Zamiast skracać nagłówek H1
     * i lead widoczne na stronie, podajemy tu osobny wariant; bez tych pól
     * meta biorą wartość z `title` i `description`.
     */
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    readingTime: z.number().optional(),
    /** Identyfikator osoby z src/data/team.ts, np. "tomasz-bajorek". */
    author: z.enum(TEAM_IDS).default(DEFAULT_AUTHOR_ID),
    /** Identyfikator osoby z src/data/team.ts, która sprawdziła treść merytorycznie. */
    reviewer: z.enum(TEAM_IDS).optional(),
    featured: z.boolean().default(false),
    /**
     * Nazwa pliku zdjęcia wyróżniającego z katalogu `public/posts/`,
     * np. "jdg-najem.png". Bez ścieżki - katalog jest jeden i płaski.
     * Pominięcie pola zostawia kartę i hero artykułu w wersji z gradientem.
     */
    cover: z.string().optional(),
    /**
     * Opis alternatywny zdjęcia. Domyślnie pusty: zdjęcie jest dekoracją
     * obok tytułu, więc czytnik ekranu nie powinien czytać go drugi raz.
     * Wypełnij, jeśli zdjęcie niesie treść (np. schemat, zrzut ekranu).
     */
    coverAlt: z.string().optional(),
    summary: z.array(z.string()).optional(),
    howTo: z.object({
      name: z.string(),
      totalTime: z.string().optional(),
      steps: z.array(z.object({ name: z.string(), text: z.string(), url: z.string().optional() })),
    }).optional(),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
  }),
});

export const collections = { blog };
