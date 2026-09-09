import { sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

/*
 * Warstwa kliencka uruchamiana na każdej podstronie: silnik zgód, baner,
 * pomiar i reguły konwersji.
 *
 * Bundler wydziela do osobnego pliku każdy moduł, z którego korzysta więcej
 * niż jeden `<script>` w komponencie. `analytics` trafia i do skryptu układu,
 * i do przycisków udostępniania, i do kreatora wyceny, więc rozpadał się na
 * kilka plików, a przeglądarka odkrywała je dopiero po pobraniu i sparsowaniu
 * skryptu strony - dodatkowa runda w sieci za kod, który po kompresji waży
 * kilka kilobajtów. Zbieramy je w jeden plik: pobiera się raz i obsługuje
 * wszystkie podstrony.
 *
 * Lista jest wyliczona świadomie. Nie ma tu `wizard`, `tax-constants` ani
 * `format`, bo używają ich wyłącznie skrypty kalkulatorów i kreatora -
 * wciągnięcie ich tutaj kazałoby stronie głównej pobierać kod, którego nigdy
 * nie uruchomi.
 */
const CLIENT_RUNTIME = [
  'src/lib/consent.ts',
  'src/lib/consent-integrations.ts',
  'src/lib/cookie-banner.ts',
  'src/lib/analytics.ts',
  'src/lib/analytics-auto.ts',
  'src/lib/conversions.ts',
  'src/lib/traffic-source.ts',
  'src/lib/ads.ts',
  'src/data/conversions.ts',
];

const isClientRuntime = (id) => {
  const path = id.split('?')[0].replaceAll('\\', '/');
  return CLIENT_RUNTIME.some((mod) => path.endsWith(`/${mod}`));
};

/**
 * Poprawki na gotowym buildzie: `modulepreload` dla zależności skryptów oraz
 * wstawienie najmniejszych z nich wprost do dokumentu.
 *
 * Obie rzeczy trzeba zrobić po fakcie, bo HTML powstaje w budowaniu serwerowym,
 * które kończy się PRZED budowaniem na przeglądarkę - w momencie renderowania
 * nazwy plików z odciskiem treści jeszcze nie istnieją. Wszystkie podstrony są
 * prerenderowane do plików (serwerowo działa tylko `/api/*`), więc przejście po
 * katalogu wyjściowym obejmuje cały serwis.
 *
 * 1. `modulepreload` - wspólny plik warstwy klienckiej przeglądarka odkryłaby
 *    dopiero po pobraniu i sparsowaniu skryptu strony. Odnośnik w <head>
 *    startuje oba pobrania naraz.
 * 2. Wstawienie do dokumentu - punkt wejścia strony to po zbudowaniu 77 bajtów
 *    (import wspólnego pliku i cztery wywołania), a runtime `prefetch` Astro
 *    niecałe 2,5 kB. Osobne żądanie na taki plik kosztuje więcej niż jego treść.
 *    Astro robi dokładnie to samo ze skryptami bez importów; tutaj rozciągamy tę
 *    zasadę na małe punkty wejścia, przepisując ich importy na adresy
 *    bezwzględne. Próg celowo niski: wspólny `taxun.js` (~14 kB) ma zostać
 *    osobnym plikiem, bo pobiera się raz na całą witrynę i siedzi w pamięci
 *    podręcznej.
 */
function optimizeBuiltScripts() {
  /** Największy punkt wejścia, który opłaca się wstawić do dokumentu. */
  const INLINE_LIMIT = 4096;

  /** Nazwa pliku -> dane kawałka zebrane w trakcie budowania. */
  const chunks = new Map();
  let base = '/';

  const joinBase = (fileName) => `${base.replace(/\/$/, '')}/${fileName}`;

  /** Domknięcie przechodnie importów - zależność zależności też jest żądaniem. */
  const dependenciesOf = (fileName, seen = new Set()) => {
    for (const dep of chunks.get(fileName)?.imports ?? []) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      dependenciesOf(dep, seen);
    }
    return seen;
  };

  /** Kawałki, do których odwołuje się inny kawałek - tych nie wstawiamy. */
  const importedByOthers = () => {
    const used = new Set();
    for (const chunk of chunks.values()) {
      for (const dep of chunk.imports) used.add(dep);
      for (const dep of chunk.dynamicImports) used.add(dep);
    }
    return used;
  };

  return {
    name: 'taxun-build-scripts',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [{
              name: 'taxun-collect-chunks',
              generateBundle(_options, bundle) {
                for (const chunk of Object.values(bundle)) {
                  if (chunk.type !== 'chunk') continue;
                  chunks.set(chunk.fileName, {
                    imports: chunk.imports ?? [],
                    dynamicImports: chunk.dynamicImports ?? [],
                    isEntry: chunk.isEntry === true,
                  });
                }
              },
            }],
          },
        });
      },
      'astro:config:done': ({ config }) => {
        base = config.base || '/';
      },
      'astro:build:done': async ({ dir, logger }) => {
        const { readdir, readFile, writeFile } = await import('node:fs/promises');
        const shared = importedByOthers();

        /** Treść punktu wejścia gotowa do wstawienia albo null, gdy się nie nadaje. */
        const inlinableCode = async (fileName) => {
          const chunk = chunks.get(fileName);
          if (!chunk || !chunk.isEntry || shared.has(fileName)) return null;

          let code;
          try {
            code = await readFile(new URL(fileName, dir), 'utf8');
          } catch {
            return null;
          }
          if (Buffer.byteLength(code) > INLINE_LIMIT) return null;

          // Adresy względne (`./taxun.[hash].js`) liczą się od katalogu pliku,
          // a w dokumencie nie ma już takiego punktu odniesienia. Przepisujemy
          // je dokładnie - po nazwach zależności, które zna bundler, a nie
          // wyrażeniem regularnym po całym kodzie.
          for (const dep of [...chunk.imports, ...chunk.dynamicImports]) {
            const bare = dep.slice(dep.lastIndexOf('/') + 1);
            code = code.split(`"./${bare}"`).join(`"${joinBase(dep)}"`);
          }
          if (code.includes('"./') || code.includes("'./")) return null;

          // Sekwencja kończąca znacznik może wystąpić tylko w literale tekstowym,
          // ale w dokumencie zamknęłaby skrypt.
          return code.replaceAll('</script', '<\\/script');
        };

        let preloaded = 0;
        let inlined = 0;
        const entries = await readdir(fileURLToPath(dir), { recursive: true });

        for (const entry of entries) {
          if (!entry.endsWith('.html')) continue;
          const file = new URL(entry.split(sep).join('/'), dir);
          let html = await readFile(file, 'utf8');
          const original = html;

          const tags = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"[^>]*><\/script>/g)];
          const nameOf = (src) => (src.startsWith(base) ? src.slice(base.length) : src.replace(/^\//, ''));

          // Najpierw preload - liczony z adresów, zanim któryś zniknie z dokumentu.
          const needed = new Set();
          for (const [, src] of tags) {
            for (const dep of dependenciesOf(nameOf(src))) needed.add(dep);
          }
          if (needed.size) {
            const links = [...needed]
              .map((dep) => `<link rel="modulepreload" href="${joinBase(dep)}">`)
              .join('');
            html = html.replace('</head>', `${links}</head>`);
            preloaded++;
          }

          for (const [tag, src] of tags) {
            const code = await inlinableCode(nameOf(src));
            if (!code) continue;
            html = html.replace(tag, `<script type="module">${code}</script>`);
            inlined++;
          }

          if (html !== original) await writeFile(file, html);
        }

        logger.info(`skrypty: preload na ${preloaded} stronach, ${inlined} punktów wejścia w dokumencie`);
      },
    },
  };
}

export default defineConfig({
  adapter: vercel(),
  site: 'https://taxun.pl',
  trailingSlash: 'never',
  integrations: [optimizeBuiltScripts()],
  redirects: {
    '/kalkulator': '/kalkulatory',
    '/kalkulator/skladka-zdrowotna-2026': '/kalkulatory/skladka-zdrowotna-2026',
    '/kalkulator/ryczalt-vs-liniowy': '/kalkulatory/ryczalt-vs-liniowy',
    '/kalkulator/wynagrodzenie-brutto-netto-2026': '/kalkulatory/wynagrodzenie-brutto-netto-2026',
  },
  build: {
    /*
     * Arkusze wstawiamy do dokumentu zamiast linkować. Przy 'auto' Astro
     * zostawiało osobnym plikiem wszystko powyżej 4 kB, więc każda strona
     * czekała przed pierwszym renderowaniem na dwa żądania - wspólny arkusz
     * układu i arkusz strony, razem około 600 ms na łączu mobilnym. Arkusz
     * jest dzielony na strony (cssCodeSplit), więc do dokumentu trafia tylko
     * to, czego dana strona używa: kilka kilobajtów po kompresji zamiast
     * dwóch rund w sieci na ścieżce krytycznej.
     */
    inlineStylesheets: 'always',
    assets: 'assets',
  },
  compressHTML: true,
  prefetch: {
    prefetchAll: true,
    /*
     * 'viewport' pobierał w tle każdy odnośnik, który wszedł w kadr - na
     * stronie głównej to kilkadziesiąt dokumentów po ok. 100 kB, zanim
     * ktokolwiek cokolwiek kliknął. 'hover' startuje pobieranie przy
     * najechaniu kursorem i przy dotknięciu ekranu, czyli kilkaset
     * milisekund przed kliknięciem: przejście dalej jest tak samo
     * natychmiastowe, a pobieramy tylko to, czym użytkownik faktycznie się
     * zainteresował.
     */
    defaultStrategy: 'hover',
  },
  image: {
    domains: ['placehold.co'],
  },
  vite: {
    build: {
      cssCodeSplit: true,
    },
    // Grupowanie dotyczy wyłącznie budowania na przeglądarkę - budowanie
    // funkcji serwerowej zostaje przy domyślnym podziale Astro.
    environments: {
      client: {
        build: {
          rollupOptions: {
            output: {
              advancedChunks: {
                groups: [{ name: 'taxun', test: isClientRuntime }],
              },
            },
          },
        },
      },
    },
  },
});
