/**
 * Sprawdzenie, czy zbudowany serwis mieści się w zakresie znaków hostowanych krojów.
 *
 * Kroje w `src/assets/fonts/` są obcięte do znaków, których używa polska strona -
 * dzięki temu Inter waży 51 kB zamiast 203 kB. Cena jest taka, że znak spoza
 * zakresu (grecka litera we wzorze, symbol matematyczny, emoji w tytule) wypada
 * z kroju i przeglądarka podmienia go na systemowy. Efekt jest cichy: tekst
 * nadal się wyświetla, tylko jeden znak ma inny rysunek i inną szerokość.
 *
 * Skrypt czyta gotowy build, a nie źródła - inaczej łapałby znaki z komentarzy
 * w kodzie (np. kreski `─` rozdzielające sekcje CSS), które nigdy nie trafiają
 * na stronę.
 *
 * Uruchomienie: npm run build && npm run check:fonts
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIRS = ['.vercel/output/static', 'dist'];
const outDir = OUT_DIRS.find((d) => existsSync(d));
if (!outDir) {
  console.error('Nie znaleziono katalogu z buildem. Uruchom najpierw: npm run build');
  process.exit(1);
}

const COVERAGE = 'src/assets/fonts/coverage.json';
if (!existsSync(COVERAGE)) {
  console.error(`Brak ${COVERAGE}. Wygeneruj go, przechodząc procedurę z docs/fonts.md.`);
  process.exit(1);
}
const { ranges, font } = JSON.parse(readFileSync(COVERAGE, 'utf8'));

/** Czy punkt kodowy mieści się w zakresie kroju. */
function covered(cp) {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [from, to] = ranges[mid];
    if (cp < from) hi = mid - 1;
    else if (cp > to) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Wszystkie pliki HTML w buildzie. */
function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(path));
    else if (entry.name.endsWith('.html')) out.push(path);
  }
  return out;
}

/**
 * Tekst widoczny dla czytelnika.
 *
 * Wycinamy skrypty i style w całości (zawierają kod, nie treść), zamieniamy
 * encje na znaki i usuwamy znaczniki. To przybliżenie, ale wystarczające:
 * fałszywy alarm co najwyżej doda znak do zakresu, którego i tak byśmy chcieli.
 */
function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&(amp|lt|gt|quot|nbsp|apos);/g, (_, e) =>
      ({ amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', apos: "'" })[e]
    );
}

const files = htmlFiles(outDir);
/** Znak -> ile razy i na której stronie po raz pierwszy. */
const missing = new Map();
let scanned = 0;

for (const file of files) {
  scanned += 1;
  const text = visibleText(readFileSync(file, 'utf8'));
  for (const char of text) {
    const cp = char.codePointAt(0);
    // Białe znaki i sterujące nie mają glifów - nie ma czego szukać w kroju.
    if (cp < 0x20 || cp === 0x7f) continue;
    if (covered(cp)) continue;
    const entry = missing.get(char) ?? { count: 0, where: file.slice(outDir.length + 1) };
    entry.count += 1;
    missing.set(char, entry);
  }
}

console.log(`Przeskanowano ${scanned} stron w ${outDir} względem ${font}.`);

if (missing.size === 0) {
  console.log('Wszystkie znaki na stronach mieszczą się w zakresie hostowanych krojów.');
  process.exit(0);
}

console.error(`\n${missing.size} znak(ów) spoza zakresu kroju - przeglądarka podmieni je na systemowe:`);
for (const [char, { count, where }] of [...missing.entries()].sort((a, b) => b[1].count - a[1].count)) {
  console.error(`  U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}  ${JSON.stringify(char)}  x${count}  (np. ${where})`);
}
console.error(
  '\nAlbo zamień znak na taki z zakresu, albo rozszerz subset - procedura w docs/fonts.md.'
);
process.exit(1);
