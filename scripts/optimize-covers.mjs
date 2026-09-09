/**
 * Przygotowanie zdjęć wyróżniających artykułów (cover photo).
 *
 * Oryginał ze stocka albo z aparatu waży kilka megabajtów i ma 4000-6700 px
 * szerokości, a serwis wysyła najwyżej 1600 px. Trzymanie takich plików
 * w repozytorium kosztowało 2,1 MB na artykuł, mimo że żaden czytelnik nigdy
 * ich nie pobiera - `<picture>` zawsze trafia w wariant AVIF albo WebP.
 *
 * Dlatego oryginał jest materiałem roboczym, a nie zawartością repozytorium.
 * Przebieg wygląda tak:
 *
 *   1. Wrzucasz zdjęcie do `public/posts/`.
 *   2. `npm run covers` koduje z niego komplet plików wynikowych.
 *   3. Skrypt przenosi oryginał do `.originals/` - katalogu poza gitem, który
 *      zostaje na Twoim dysku.
 *   4. Commitujesz to, co powstało: warianty i `manifest.json`.
 *
 * W repozytorium zostają więc wyłącznie pliki, które ktoś naprawdę pobiera.
 *
 * Manifest jest źródłem prawdy. Trzyma skrót treści oryginału, jego wymiary
 * i listę plików wynikowych, więc skrypt wie, co powinno istnieć, nawet gdy
 * oryginału nie ma pod ręką - i potrafi to sprawdzić na czystym klonie.
 *
 * Komplet plików dla jednego zdjęcia:
 *
 *   - warianty AVIF i WebP w szerokościach 320-1600 px (to je pobiera
 *     przeglądarka),
 *   - jeden JPEG awaryjny dla przeglądarek bez AVIF i bez WebP - to on stoi
 *     w `<img src>`, więc po usunięciu oryginału nie ma tam martwego adresu,
 *   - JPEG 1200x630 dla Open Graph, bo podgląd linku na Facebooku czy
 *     LinkedInie potrzebuje proporcji 1,91:1, a nie pionowego kadru.
 *
 * Uruchomienie:
 *   npm run covers                    - koduje nowe zdjęcia i archiwizuje oryginały
 *   npm run covers -- --check         - nic nie zapisuje; kończy błędem, gdy
 *                                       commit jest niekompletny (używa tego
 *                                       hak pre-commit i przebieg w CI)
 *   npm run covers -- --forget a.jpg  - usuwa zdjęcie z manifestu razem z plikami
 */
import { copyFile, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';

// --- ustawienia -------------------------------------------------------------

/** Katalog, do którego wrzuca się nowe zdjęcia. */
const SOURCE_DIR = 'public/posts';

/** Katalog na warianty. Commitowany. */
const OUTPUT_DIR = join(SOURCE_DIR, '_optimized');

/**
 * Archiwum oryginałów - poza gitem, zostaje lokalnie.
 *
 * Leży poza `public/`, bo wszystko w `public/` Astro kopiuje do buildu, a to
 * przywróciłoby dokładnie te megabajty, których się pozbywamy.
 */
const ARCHIVE_DIR = '.originals';

/**
 * Oryginały zdjęć wycofanych przez `--forget`.
 *
 * Podkatalog, a nie kasowanie: `listImages()` czyta wyłącznie pliki leżące
 * bezpośrednio w katalogu, więc stąd nic się już nie odtworzy, a plik zostaje,
 * gdyby wycofanie okazało się pomyłką.
 */
const FORGOTTEN_DIR = join(ARCHIVE_DIR, '_wycofane');

/** Manifest czytany przy renderowaniu stron. Źródło prawdy. */
const MANIFEST = join(OUTPUT_DIR, 'manifest.json');
const MANIFEST_NAME = 'manifest.json';

/** Katalog z artykułami - stąd wiadomo, które zdjęcia są jeszcze używane. */
const CONTENT_DIR = 'src/content/blog';

/** Rozszerzenia traktowane jako zdjęcie artykułu. */
const SOURCE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

/**
 * Szerokości wariantów. Najniższa obsługuje kartę na telefonie, najwyższa -
 * szeroki hero artykułu na ekranie 2x. Warianty szersze niż oryginał nie
 * powstają: powiększanie zdjęcia dokłada bajty, nie szczegóły.
 */
const WIDTHS = [320, 480, 640, 960, 1280, 1600];

/** Formaty w kolejności od najlepiej kompresującego - przeglądarka bierze pierwszy, który zna. */
const FORMATS = [
  { ext: 'avif', options: { quality: 50, effort: 5 } },
  { ext: 'webp', options: { quality: 76, effort: 5 } },
];

/**
 * JPEG awaryjny w `<img src>`.
 *
 * Pobierają go wyłącznie przeglądarki bez AVIF i bez WebP, czyli ułamek
 * procenta ruchu - stąd jedna średnia szerokość zamiast całego zestawu.
 */
const FALLBACK = { width: 960, options: { quality: 80, mozjpeg: true } };

/** Obrazek Open Graph. Proporcja 1,91:1 to format, którego oczekują serwisy. */
const OG = { width: 1200, height: 630, options: { quality: 80, mozjpeg: true } };

// --- pomocnicze -------------------------------------------------------------

const CHECK_ONLY = process.argv.includes('--check');
const FORGET = (() => {
  const at = process.argv.indexOf('--forget');
  return at >= 0 ? process.argv[at + 1] : null;
})();

/** Odmiana rzeczownika po liczbie - 1 wariant, 2 warianty, 5 wariantów. */
function plural(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (count === 1) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * Skrót treści oryginału.
 *
 * Siedzi w nazwie każdego pliku wynikowego, dzięki czemu warianty można
 * cache'ować bezterminowo (`immutable`): podmiana zdjęcia pod tą samą nazwą
 * daje inny skrót, czyli inny adres. Ten sam skrót trafia do manifestu, więc
 * po podmianie widać, że pliki są nieaktualne, nawet bez ich otwierania.
 */
function contentHash(buffer) {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 8);
}

/** Obrazy leżące bezpośrednio w katalogu (bez podkatalogów). */
async function listImages(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort();
}

/** Pliki leżące w katalogu z wynikami, bez manifestu. */
async function listOutputs() {
  if (!existsSync(OUTPUT_DIR)) return [];
  const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name !== MANIFEST_NAME)
    .map((entry) => entry.name)
    .sort();
}

/**
 * Nazwy zdjęć, na które wskazuje pole `cover` któregokolwiek artykułu.
 *
 * Służy wyłącznie do ostrzeżenia o zdjęciach, których już nikt nie używa.
 * Sprzątamy je dopiero na wyraźne polecenie (`--forget`), bo zdjęcie bywa
 * przygotowane wcześniej niż tekst, który się na nie powoła.
 */
async function referencedCovers() {
  if (!existsSync(CONTENT_DIR)) return null;
  const names = new Set();
  const files = (await readdir(CONTENT_DIR, { recursive: true, encoding: 'utf-8' }))
    .filter((name) => name.endsWith('.md'));
  for (const file of files) {
    const frontmatter = (await readFile(join(CONTENT_DIR, file), 'utf8')).split('---')[1] ?? '';
    const match = frontmatter.match(/^cover:\s*["']?([^"'\n]+)["']?\s*$/m);
    if (match) names.add(match[1].trim());
  }
  return names;
}

/** Szerokości wariantów dla zdjęcia o danej szerokości oryginału. */
function targetWidths(width) {
  const targets = WIDTHS.filter((w) => w < width);
  if (targets.length === 0 || targets.at(-1) !== Math.min(width, WIDTHS.at(-1))) {
    targets.push(Math.min(width, WIDTHS.at(-1)));
  }
  return targets;
}

/** Nazwa wspólna dla wszystkich plików jednego zdjęcia. */
function stemFor(fileName, hash) {
  return `${basename(fileName, extname(fileName))}.${hash}`;
}

/**
 * Wpis manifestu wyliczony z samych metadanych.
 *
 * Kluczowe, że nie potrzebuje oryginału: wymiary i skrót są w manifeście, więc
 * na czystym klonie wiadomo, jakie pliki powinny istnieć, i można to sprawdzić.
 */
function describe(fileName, { hash, width, height }) {
  const stem = stemFor(fileName, hash);
  const variants = {};
  for (const format of FORMATS) {
    variants[format.ext] = targetWidths(width).map((target) => ({
      width: target,
      src: `/posts/_optimized/${stem}-${target}.${format.ext}`,
    }));
  }

  const fallbackWidth = Math.min(FALLBACK.width, width);
  return {
    hash,
    width,
    height,
    fallback: {
      src: `/posts/_optimized/${stem}-fallback.jpg`,
      width: fallbackWidth,
      height: Math.round((height / width) * fallbackWidth),
    },
    og: { src: `/posts/_optimized/${stem}-og.jpg`, width: OG.width, height: OG.height },
    variants,
  };
}

/** Wszystkie pliki należące do wpisu, po nazwach. */
function filesOf(entry) {
  const names = [basename(entry.fallback.src), basename(entry.og.src)];
  for (const list of Object.values(entry.variants)) {
    for (const variant of list) names.push(basename(variant.src));
  }
  return names;
}

// --- kodowanie --------------------------------------------------------------

/** Zapisuje brakujące pliki wpisu. Wymaga oryginału. */
async function encode(fileName, entry, buffer) {
  let written = 0;

  for (const format of FORMATS) {
    for (const variant of entry.variants[format.ext]) {
      const path = join(OUTPUT_DIR, basename(variant.src));
      if (existsSync(path)) continue;
      await sharp(buffer)
        .resize({ width: variant.width, withoutEnlargement: true })
        .toFormat(format.ext, format.options)
        .toFile(path);
      written += 1;
    }
  }

  const fallbackPath = join(OUTPUT_DIR, basename(entry.fallback.src));
  if (!existsSync(fallbackPath)) {
    await sharp(buffer)
      .resize({ width: FALLBACK.width, withoutEnlargement: true })
      .jpeg(FALLBACK.options)
      .toFile(fallbackPath);
    written += 1;
  }

  const ogPath = join(OUTPUT_DIR, basename(entry.og.src));
  if (!existsSync(ogPath)) {
    await sharp(buffer)
      .resize({ width: OG.width, height: OG.height, fit: 'cover' })
      .jpeg(OG.options)
      .toFile(ogPath);
    written += 1;
  }

  return written;
}

/** Wymiary i skrót oryginału. `null`, jeśli pliku nie da się odczytać jako obrazu. */
async function inspect(fileName, buffer) {
  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (error) {
    console.error(`  BŁĄD  ${fileName} - nie udało się odczytać obrazu: ${error.message}`);
    return null;
  }
  const { width, height } = metadata;
  if (!width || !height) {
    console.error(`  BŁĄD  ${fileName} - brak wymiarów obrazu.`);
    return null;
  }
  return { hash: contentHash(buffer), width, height };
}

// --- manifest ---------------------------------------------------------------

async function readManifest() {
  if (!existsSync(MANIFEST)) return {};
  try {
    const parsed = JSON.parse(await readFile(MANIFEST, 'utf8'));
    return parsed?.covers ?? {};
  } catch {
    return {};
  }
}

function serializeManifest(covers) {
  const sorted = Object.fromEntries(Object.entries(covers).sort(([a], [b]) => a.localeCompare(b)));
  return `${JSON.stringify({ version: 2, covers: sorted }, null, 2)}\n`;
}

// --- przebieg ---------------------------------------------------------------

async function main() {
  const covers = await readManifest();

  if (FORGET) {
    if (!covers[FORGET]) {
      console.error(`W manifeście nie ma zdjęcia "${FORGET}".`);
      process.exit(1);
    }
    for (const name of filesOf(covers[FORGET])) {
      if (existsSync(join(OUTPUT_DIR, name))) await unlink(join(OUTPUT_DIR, name));
    }
    delete covers[FORGET];
    await writeFile(MANIFEST, serializeManifest(covers), 'utf8');

    // Bez odstawienia oryginału następne uruchomienie zobaczyłoby go w archiwum
    // i odtworzyło komplet plików - wycofanie nie miałoby żadnego skutku.
    const archived = join(ARCHIVE_DIR, FORGET);
    if (existsSync(archived)) {
      await mkdir(FORGOTTEN_DIR, { recursive: true });
      await rename(archived, join(FORGOTTEN_DIR, FORGET));
      console.log(`Usunięto "${FORGET}" z manifestu razem z plikami. Oryginał odstawiony do ${FORGOTTEN_DIR}/.`);
    } else {
      console.log(`Usunięto "${FORGET}" z manifestu razem z plikami.`);
    }
    return;
  }

  // Nowe zdjęcia leżą w katalogu wrzutek, wcześniej przetworzone - w archiwum.
  // Wrzutka wygrywa: to ona jest świeższą wersją pliku o tej nazwie.
  const dropped = await listImages(SOURCE_DIR);
  const archived = await listImages(ARCHIVE_DIR);
  const sourceDir = new Map(archived.map((name) => [name, ARCHIVE_DIR]));
  for (const name of dropped) sourceDir.set(name, SOURCE_DIR);

  const problems = [];
  let encoded = 0;
  let archivedNow = 0;

  // 1. Zdjęcia, dla których mamy oryginał: sprawdzamy skrót i kodujemy braki.
  for (const [fileName, dir] of [...sourceDir].sort(([a], [b]) => a.localeCompare(b))) {
    const buffer = await readFile(join(dir, fileName));
    const info = await inspect(fileName, buffer);
    if (!info) {
      problems.push(`${fileName} - nie jest obrazem`);
      continue;
    }

    const known = covers[fileName];
    const changed = !known || known.hash !== info.hash;
    const entry = changed ? describe(fileName, info) : known;
    const missing = filesOf(entry).filter((name) => !existsSync(join(OUTPUT_DIR, name)));

    if (CHECK_ONLY) {
      if (dir === SOURCE_DIR) {
        problems.push(`${fileName} - oryginał czeka w ${SOURCE_DIR}/, nie został przetworzony`);
      } else if (missing.length > 0) {
        problems.push(`${fileName} - brakuje ${missing.length} ${plural(missing.length, 'pliku', 'plików', 'plików')}`);
      }
      covers[fileName] = entry;
      continue;
    }

    if (changed || missing.length > 0) {
      await mkdir(OUTPUT_DIR, { recursive: true });
      const written = await encode(fileName, entry, buffer);
      encoded += written;
      covers[fileName] = entry;
      console.log(
        `  ${known ? 'nowa wersja' : 'nowe       '}  ${fileName} (${info.width}x${info.height}) - ` +
          `zapisano ${written} ${plural(written, 'plik', 'pliki', 'plików')}`
      );
    }

    // Oryginał zjeżdża z repozytorium na dysk. Kopiujemy i kasujemy zamiast
    // rename, bo `.originals/` bywa na innym urządzeniu niż katalog projektu.
    if (dir === SOURCE_DIR) {
      await mkdir(ARCHIVE_DIR, { recursive: true });
      const target = join(ARCHIVE_DIR, fileName);
      try {
        await rename(join(SOURCE_DIR, fileName), target);
      } catch {
        await copyFile(join(SOURCE_DIR, fileName), target);
        await unlink(join(SOURCE_DIR, fileName));
      }
      archivedNow += 1;
      console.log(`  archiwum     ${fileName} -> ${ARCHIVE_DIR}/`);
    }
  }

  // 2. Zdjęcia, których oryginału nie ma nigdzie - liczy się to, co w manifeście.
  //    Tak wygląda czysty klon i tak wygląda deployment.
  for (const [fileName, entry] of Object.entries(covers)) {
    if (sourceDir.has(fileName)) continue;
    const missing = filesOf(entry).filter((name) => !existsSync(join(OUTPUT_DIR, name)));
    if (missing.length === 0) continue;
    problems.push(
      `${fileName} - brakuje ${missing.length} ${plural(missing.length, 'pliku', 'plików', 'plików')} ` +
        `i nie ma oryginału w ${ARCHIVE_DIR}/ (${missing[0]}${missing.length > 1 ? ', ...' : ''})`
    );
  }

  // 3. Pliki, do których nie prowadzi już żaden wpis - zostają po podmianie zdjęcia.
  const expected = new Set(Object.values(covers).flatMap(filesOf));
  const orphans = (await listOutputs()).filter((name) => !expected.has(name));

  const serialized = serializeManifest(covers);
  const currentManifest = existsSync(MANIFEST) ? await readFile(MANIFEST, 'utf8') : null;

  if (CHECK_ONLY) {
    if (orphans.length > 0) {
      problems.push(`${orphans.length} ${plural(orphans.length, 'nieużywany plik', 'nieużywane pliki', 'nieużywanych plików')} w ${OUTPUT_DIR}/`);
    }
    if (currentManifest !== serialized) problems.push('manifest jest nieaktualny');

    if (problems.length > 0) {
      console.error('Zdjęcia artykułów nie są gotowe do commitu:\n');
      for (const problem of problems) console.error(`  - ${problem}`);
      console.error('\nUruchom `npm run covers` i dodaj wynik do commitu.');
      process.exit(1);
    }
    console.log(
      `Zdjęcia artykułów są kompletne (${Object.keys(covers).length} ${plural(Object.keys(covers).length, 'zdjęcie', 'zdjęcia', 'zdjęć')}).`
    );
    return;
  }

  if (problems.length > 0) {
    console.error('\nNie da się odtworzyć kompletu plików:\n');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(`\nWrzuć brakujący oryginał do ${SOURCE_DIR}/ i uruchom ponownie.`);
    process.exit(1);
  }

  for (const name of orphans) {
    await unlink(join(OUTPUT_DIR, name));
    console.log(`  usunięto     ${name} (nieużywany plik)`);
  }

  if (currentManifest !== serialized) {
    await mkdir(OUTPUT_DIR, { recursive: true });
    await writeFile(MANIFEST, serialized, 'utf8');
    console.log(`Zapisano ${MANIFEST}.`);
  }

  // Zdjęcia, na które nie powołuje się już żaden artykuł. Nie kasujemy ich sami:
  // zdjęcie bywa gotowe wcześniej niż tekst, a `--forget` jest jednoznaczne.
  const referenced = await referencedCovers();
  if (referenced) {
    const unused = Object.keys(covers).filter((name) => !referenced.has(name));
    if (unused.length > 0) {
      console.log(`\nNie używa ich żaden artykuł: ${unused.join(', ')}.`);
      console.log(`Jeśli to celowe, zostaw; jeśli nie - \`npm run covers -- --forget ${unused[0]}\`.`);
    }
  }

  const total = Object.keys(covers).length;
  if (encoded === 0 && archivedNow === 0 && orphans.length === 0 && currentManifest === serialized) {
    console.log(`Zdjęcia artykułów są aktualne (${total} ${plural(total, 'zdjęcie', 'zdjęcia', 'zdjęć')}) - nie ma czego kodować.`);
  }
}

await main();
