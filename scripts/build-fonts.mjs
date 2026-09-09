/**
 * Przygotowanie hostowanych krojów pisma.
 *
 * Pliki źródłowe leżą w `fonts/` i są commitowane - nic się nie pobiera, więc
 * build nie zależy od dostępności zewnętrznego serwera. Ten skrypt obcina je
 * do znaków i funkcji, których serwis faktycznie używa, i zapisuje wynik do
 * `src/assets/fonts/`.
 *
 * Wynik też jest commitowany, tak samo jak warianty zdjęć: deployment ma
 * przepisywać repozytorium na stronę, a nie odtwarzać po drodze rzeczy, które
 * dawno się nie zmieniły. `coverage.json` trzyma odcisk wejścia (pliki źródłowe
 * plus wszystkie decyzje z tego skryptu), więc powtórne uruchomienie kończy się
 * po ułamku sekundy, jeśli nic się nie zmieniło.
 *
 * Uruchomienie:
 *   npm run fonts            - obcina kroje, jeśli odcisk wejścia się zmienił
 *   npm run fonts -- --check - nic nie zapisuje, kończy błędem, jeśli commit
 *                              nie zawiera aktualnych krojów
 *
 * Całość działa na WebAssembly (harfbuzz) i czystym JS (fontverter), bez
 * natywnych binariów i bez Pythona - to samo środowisko, które daje Vercel.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import fontverter from 'fontverter';

const require = createRequire(import.meta.url);

/** Tryb kontrolny: sprawdzamy stan katalogu, ale niczego nie zapisujemy. */
const CHECK_ONLY = process.argv.includes('--check');

const SOURCE_DIR = 'fonts';
const OUTPUT_DIR = 'src/assets/fonts';
const COVERAGE = join(OUTPUT_DIR, 'coverage.json');

/**
 * Znaki, które zostają w krojach.
 *
 * Podstawowa łacina, Latin Extended-A (polskie znaki i reszta Europy
 * Środkowej), typograficzna interpunkcja, indeksy górne i dolne, waluty,
 * strzałki, operatory matematyczne, znaczniki i figury geometryczne.
 *
 * Google dzieli kroje na podzakresy i polska strona musi pobrać dwa naraz
 * (`latin` + `latin-ext`) - dla samego Intera 130 kB. Tutaj oba mieszczą się
 * w jednym pliku, bo wycinamy bloki, których serwis nie używa: rozszerzenia
 * fonetyczne, Latin Extended Additional, alfabety niełacińskie.
 */
const UNICODE_RANGES = [
  [0x0000, 0x00ff], [0x0100, 0x017f], [0x0192, 0x0192], [0x01fa, 0x01ff],
  [0x02bb, 0x02bc], [0x02c6, 0x02c6], [0x02da, 0x02da], [0x02dc, 0x02dc],
  [0x2000, 0x206f], [0x2070, 0x209f], [0x20a0, 0x20bf], [0x2113, 0x2113],
  [0x2116, 0x2116], [0x2122, 0x2122], [0x2126, 0x2126], [0x212e, 0x212e],
  [0x2190, 0x21bb], [0x2202, 0x22ff], [0x2713, 0x2718], [0x25a0, 0x25ff],
  [0xfeff, 0xfeff], [0xfffd, 0xfffd],
];

/**
 * Funkcje OpenType, które zostają.
 *
 * `cv02`, `cv03`, `cv04`, `cv11` to warianty znaków Intera ustawiane
 * w global.css przez `font-feature-settings` - bez nich litery wyglądałyby
 * inaczej niż dotąd. `tnum` obsługuje `font-variant-numeric: tabular-nums`.
 * Reszta to podstawy składu. Warianty stylistyczne `ss01`-`ss08`, `dlig`
 * czy `salt` odpadają i oszczędzają ~13 kB, bo nic ich nie włącza.
 *
 * Gdy w CSS pojawi się nowa funkcja, trzeba ją tutaj dopisać - inaczej
 * po prostu nie zadziała.
 */
const LAYOUT_FEATURES = [
  'kern', 'liga', 'clig', 'calt', 'ccmp', 'mark', 'mkmk', 'rlig', 'locl',
  'cv02', 'cv03', 'cv04', 'cv11',
  'tnum', 'pnum', 'frac', 'sups', 'subs', 'zero', 'case', 'ordn',
];

/**
 * Kroje do przygotowania.
 *
 * `axes` zawęża osie fontów zmiennych do grubości, których używa CSS.
 * W Interze oś `opsz` (rozmiar optyczny) przypinamy do domyślnych 14 - jest
 * tu krojem tekstowym, a zachowanie tej osi kosztowało 27 kB.
 */
const FONTS = [
  {
    source: 'Inter[opsz,wght].ttf',
    output: 'inter-variable-latin.woff2',
    axes: { opsz: 14, wght: { min: 400, max: 700, default: 400 } },
    /** Krój tekstowy - to jego zakres znaków sprawdza `npm run check:fonts`. */
    primary: true,
  },
  {
    source: 'PlusJakartaSans[wght].ttf',
    output: 'plus-jakarta-sans-variable-latin.woff2',
    axes: { wght: { min: 500, max: 800, default: 500 } },
  },
];

// --- harfbuzz ---------------------------------------------------------------

/**
 * Ścieżka do modułu WebAssembly z subsetterem.
 *
 * Adresujemy go przez katalog publicznego punktu wejścia pakietu, a nie
 * bezpośrednio - `harfbuzzjs` ma mapę `exports`, która nie wystawia plików
 * `.wasm`, więc `require.resolve('harfbuzzjs/...wasm')` kończy się błędem.
 */
function locateSubsetWasm() {
  const packageDir = dirname(require.resolve('harfbuzzjs'));
  const candidates = ['harfbuzz-subset.wasm', 'hb-subset.wasm'];
  for (const name of candidates) {
    const path = join(packageDir, name);
    if (existsSync(path)) return path;
  }
  throw new Error(
    `Nie znalazłem modułu subsettera w ${packageDir} (szukałem: ${candidates.join(', ')}). ` +
      'Prawdopodobnie zmienił się układ pakietu harfbuzzjs.'
  );
}

const { instance } = await WebAssembly.instantiate(await readFile(locateSubsetWasm()));
const hb = instance.exports;

/**
 * Widok na pamięć modułu.
 *
 * Czytany przy każdym użyciu, a nie zapamiętany raz: `malloc` potrafi
 * rozszerzyć pamięć WebAssembly, co unieważnia wcześniejsze widoki.
 */
const heap = () => new Uint8Array(hb.memory.buffer);

/** Czterobajtowy znacznik OpenType jako liczba, np. 'kern' -> 0x6b65726e. */
const tag = (name) => name.split('').reduce((acc, ch) => (acc << 8) + ch.charCodeAt(0), 0);

/** Obcięty krój w formacie TrueType. */
function subsetFont(sourceBytes, { axes }) {
  const input = hb.hb_subset_input_create_or_fail();
  if (input === 0) throw new Error('harfbuzz: nie udało się utworzyć wejścia dla subsetu.');

  const fontPtr = hb.malloc(sourceBytes.byteLength);
  heap().set(sourceBytes, fontPtr);
  const blob = hb.hb_blob_create(fontPtr, sourceBytes.byteLength, 2 /* WRITABLE */, 0, 0);
  const face = hb.hb_face_create(blob, 0);
  hb.hb_blob_destroy(blob);

  const cleanupFace = () => {
    hb.hb_face_destroy(face);
    hb.free(fontPtr);
  };

  try {
    // Domyślnie harfbuzz zostawia własną listę funkcji - nie ma w niej wariantów
    // cv*, których używa CSS. Dlatego czyścimy zbiór i wpisujemy swoją listę.
    const features = hb.hb_subset_input_set(input, 6 /* HB_SUBSET_SETS_LAYOUT_FEATURE_TAG */);
    hb.hb_set_clear(features);
    for (const name of LAYOUT_FEATURES) hb.hb_set_add(features, tag(name));

    const unicodes = hb.hb_subset_input_unicode_set(input);
    for (const [from, to] of UNICODE_RANGES) {
      for (let cp = from; cp <= to; cp += 1) hb.hb_set_add(unicodes, cp);
    }

    for (const [axis, value] of Object.entries(axes)) {
      const ok = typeof value === 'number'
        ? hb.hb_subset_input_pin_axis_location(input, face, tag(axis), value)
        : hb.hb_subset_input_set_axis_range(input, face, tag(axis), value.min, value.max, value.default);
      if (!ok) throw new Error(`harfbuzz: nie udało się ustawić osi "${axis}" - czy krój ją ma?`);
    }

    const subset = hb.hb_subset_or_fail(face, input);
    if (subset === 0) throw new Error('harfbuzz: obcinanie nie powiodło się - uszkodzony plik źródłowy?');

    const resultBlob = hb.hb_face_reference_blob(subset);
    const offset = hb.hb_blob_get_data(resultBlob, 0);
    const length = hb.hb_blob_get_length(resultBlob);
    if (length === 0) {
      hb.hb_blob_destroy(resultBlob);
      hb.hb_face_destroy(subset);
      throw new Error('harfbuzz: obcięty krój jest pusty.');
    }
    // Kopiujemy natychmiast - bufor żyje w pamięci modułu i zaraz go zwalniamy.
    const bytes = Buffer.from(heap().subarray(offset, offset + length));

    hb.hb_blob_destroy(resultBlob);
    hb.hb_face_destroy(subset);
    return bytes;
  } finally {
    hb.hb_subset_input_destroy(input);
    cleanupFace();
  }
}

// --- odczyt pokrycia znaków -------------------------------------------------

/**
 * Punkty kodowe obsługiwane przez krój, czytane z tablicy `cmap`.
 *
 * Potrzebne dla `npm run check:fonts`: sama lista żądanych zakresów nie
 * wystarcza, bo krój nie musi mieć każdego znaku, o który poprosiliśmy.
 * Obsługujemy formaty 4 i 12 - tylko te występują we współczesnych krojach.
 */
function collectUnicodes(ttf) {
  const view = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
  const numTables = view.getUint16(4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i += 1) {
    const record = 12 + i * 16;
    const name = String.fromCharCode(...ttf.subarray(record, record + 4));
    if (name === 'cmap') { cmapOffset = view.getUint32(record + 8); break; }
  }
  if (cmapOffset < 0) throw new Error('W kroju nie ma tablicy cmap.');

  // Wybieramy podtablicę: najpierw Unicode pełnozakresowa (3,10), potem BMP (3,1).
  const subtables = view.getUint16(cmapOffset + 2);
  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < subtables; i += 1) {
    const record = cmapOffset + 4 + i * 8;
    const platform = view.getUint16(record);
    const encoding = view.getUint16(record + 2);
    const offset = cmapOffset + view.getUint32(record + 4);
    const score = platform === 3 && encoding === 10 ? 3
      : platform === 3 && encoding === 1 ? 2
      : platform === 0 ? 1 : 0;
    if (score > bestScore) { bestScore = score; best = offset; }
  }
  if (best < 0) throw new Error('W tablicy cmap nie ma podtablicy Unicode.');

  const codepoints = new Set();
  const format = view.getUint16(best);

  if (format === 12) {
    const groups = view.getUint32(best + 12);
    for (let i = 0; i < groups; i += 1) {
      const g = best + 16 + i * 12;
      const start = view.getUint32(g);
      const end = view.getUint32(g + 4);
      const startGlyph = view.getUint32(g + 8);
      if (startGlyph === 0) continue;
      for (let cp = start; cp <= end; cp += 1) codepoints.add(cp);
    }
    return codepoints;
  }

  if (format === 4) {
    const segCount = view.getUint16(best + 6) / 2;
    const endCodes = best + 14;
    const startCodes = endCodes + segCount * 2 + 2;
    const idDeltas = startCodes + segCount * 2;
    const idRangeOffsets = idDeltas + segCount * 2;
    for (let seg = 0; seg < segCount; seg += 1) {
      const end = view.getUint16(endCodes + seg * 2);
      const start = view.getUint16(startCodes + seg * 2);
      if (start === 0xffff) continue;
      const delta = view.getInt16(idDeltas + seg * 2);
      const rangeOffsetAt = idRangeOffsets + seg * 2;
      const rangeOffset = view.getUint16(rangeOffsetAt);
      for (let cp = start; cp <= end && cp !== 0xffff; cp += 1) {
        let glyph;
        if (rangeOffset === 0) {
          glyph = (cp + delta) & 0xffff;
        } else {
          const at = rangeOffsetAt + rangeOffset + (cp - start) * 2;
          if (at + 1 >= ttf.byteLength) continue;
          glyph = view.getUint16(at);
          if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph !== 0) codepoints.add(cp);
      }
    }
    return codepoints;
  }

  throw new Error(`Nieobsługiwany format tablicy cmap: ${format}.`);
}

/** Przedziały ciągłych punktów kodowych - zwarty zapis dla coverage.json. */
function toRanges(codepoints) {
  const ranges = [];
  let start = null;
  let prev = null;
  for (const cp of [...codepoints].sort((a, b) => a - b)) {
    if (start === null) { start = prev = cp; }
    else if (cp === prev + 1) { prev = cp; }
    else { ranges.push([start, prev]); start = prev = cp; }
  }
  if (start !== null) ranges.push([start, prev]);
  return ranges;
}

// --- przebieg ---------------------------------------------------------------

/**
 * Odcisk wejścia: pliki źródłowe plus wszystkie decyzje z tego skryptu.
 * Gdy nic się nie zmieniło, pomijamy przekodowanie - to on sprawia, że
 * `npm run dev` i deployment nie płacą za obcinanie krojów w kółko.
 */
async function inputHash(sources) {
  const hash = createHash('sha256');
  for (const bytes of sources) hash.update(bytes);
  hash.update(JSON.stringify({ UNICODE_RANGES, LAYOUT_FEATURES, FONTS }));
  return hash.digest('hex').slice(0, 16);
}

async function main() {
  const sources = [];
  for (const font of FONTS) {
    const path = join(SOURCE_DIR, font.source);
    if (!existsSync(path)) {
      console.error(`Brak pliku źródłowego ${path}. Kroje są commitowane - sprawdź, czy repozytorium jest kompletne.`);
      process.exit(1);
    }
    sources.push(await readFile(path));
  }

  const hash = await inputHash(sources);
  const outputsExist = FONTS.every((f) => existsSync(join(OUTPUT_DIR, f.output))) && existsSync(COVERAGE);
  if (outputsExist) {
    try {
      const previous = JSON.parse(await readFile(COVERAGE, 'utf8'));
      if (previous.inputHash === hash) {
        console.log('Kroje są aktualne - pomijam.');
        return;
      }
    } catch {
      // Uszkodzony manifest to powód, żeby zbudować od nowa.
    }
  }

  if (CHECK_ONLY) {
    console.error(
      `Kroje w ${OUTPUT_DIR} są nieaktualne wobec źródeł w ${SOURCE_DIR}.\n` +
        'Uruchom `npm run fonts` i zacommituj wynik.'
    );
    process.exit(1);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  console.log(`Przygotowanie krojów (${FONTS.length}):`);

  let coverage = null;
  for (const [index, font] of FONTS.entries()) {
    const ttf = subsetFont(sources[index], font);
    const woff2 = await fontverter.convert(ttf, 'woff2', 'truetype');
    await writeFile(join(OUTPUT_DIR, font.output), woff2);

    const unicodes = collectUnicodes(ttf);
    if (font.primary) coverage = unicodes;
    console.log(
      `  ok    ${font.output} - ${(woff2.length / 1024).toFixed(1)} kB, ` +
        `${unicodes.size} znaków, ${LAYOUT_FEATURES.length} funkcji OpenType`
    );
  }

  if (!coverage) throw new Error('Żaden krój nie jest oznaczony jako `primary` - nie ma z czego zbudować coverage.json.');

  await writeFile(
    COVERAGE,
    `${JSON.stringify({
      _comment: 'Generowane przez scripts/build-fonts.mjs. Zakres znaków kroju tekstowego, sprawdzany przez npm run check:fonts.',
      font: FONTS.find((f) => f.primary).output,
      inputHash: hash,
      codepoints: coverage.size,
      ranges: toRanges(coverage),
    }, null, 0)}\n`,
    'utf8'
  );
  console.log(`Zapisano ${COVERAGE}.`);
}

await main();
