/*
 * Pochodne logo: znak, ikony i obrazek Open Graph.
 *
 * Źródłem jest jeden plik - `src/assets/brand/logo.png`. Wszystko inne z niego
 * wycinamy albo składamy, więc podmiana logo to podmiana tego pliku i jedno
 * uruchomienie `npm run brand`. Wcześniej znak istniał osobno jako rysunek
 * wektorowy i rozjeżdżał się z logo: inna grubość strzałki, inny promień rogów.
 *
 * Wyniki commitujemy - deployment ma je brać z repozytorium, a nie składać od
 * nowa, i te same pliki muszą leżeć pod stałymi adresami, bo odwołują się do
 * nich dane strukturalne i Open Graph.
 *
 * Uruchomienie: `npm run brand`. Nie wpinamy go w `check:assets` ani w hak
 * pre-commit: porównanie musiałoby iść po bajtach gotowych plików, a te zależą
 * od wersji sharpa i libvips, więc na innej maszynie zapalałoby się bez powodu.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const at = (...parts) => join(root, ...parts);

/*
 * Kroje pisma dla librsvg (to ono renderuje SVG pod spodem sharpa). Zamiast
 * wymagać, żeby ktoś zainstalował je w systemie, wskazujemy fontconfigowi
 * katalog `fonts/` z repozytorium. Zmienna musi być ustawiona, zanim sharp
 * zostanie zaimportowany - fontconfig czyta ją raz, przy inicjalizacji.
 */
const fontsConfig = join(mkdtempSync(join(tmpdir(), 'taxun-fonts-')), 'fonts.conf');
writeFileSync(
  fontsConfig,
  `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>${at('fonts')}</dir>
  <dir>/usr/share/fonts</dir>
  <dir prefix="xdg">fonts</dir>
  <cachedir prefix="xdg">fontconfig</cachedir>
</fontconfig>
`,
);
process.env.FONTCONFIG_FILE = fontsConfig;

const { default: sharp } = await import('sharp');

const SOURCE = at('src', 'assets', 'brand', 'logo.png');
const OG_TEMPLATE = at('src', 'assets', 'brand', 'og-image.svg');

/** Jednakowe ustawienia PNG wszędzie - paleta bez widocznej straty na grafice. */
const png = { compressionLevel: 9, effort: 10, palette: true, quality: 100 };

/**
 * Prostokąt znaku w logo, policzony z samego pliku.
 *
 * Znak leży po lewej, a między nim a napisem jest przerwa z samych przezroczystych
 * pikseli - i to ona wyznacza prawą krawędź. Liczymy to zamiast wpisywać
 * współrzędne na sztywno, żeby kolejna wersja logo o innych proporcjach nie
 * wymagała poprawki w skrypcie.
 */
async function markRect(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];
  const columnUsed = (x) => {
    for (let y = 0; y < info.height; y++) if (alphaAt(x, y) > 8) return true;
    return false;
  };

  let left = 0;
  while (left < info.width && !columnUsed(left)) left++;
  if (left === info.width) throw new Error('logo.png jest puste - nie ma czego wycinać');

  let right = left;
  while (right + 1 < info.width && columnUsed(right + 1)) right++;

  let top = info.height;
  let bottom = -1;
  for (let x = left; x <= right; x++) {
    for (let y = 0; y < info.height; y++) {
      if (alphaAt(x, y) <= 8) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  const width = right - left + 1;
  const height = bottom - top + 1;
  // Znak jest kwadratem. Różnica o piksel to zaokrąglenie krawędzi, większa
  // znaczy, że wycinamy nie to co trzeba - i lepiej się o tym dowiedzieć teraz
  // niż zobaczyć rozjechaną ikonę na produkcji.
  if (Math.abs(width - height) > 2) {
    throw new Error(`znak nie jest kwadratem (${width}x${height}) - sprawdź logo.png`);
  }
  return { left, top, width, height: width };
}

/** Kolor tła znaku - spod jego środkowej górnej części, z dala od rogów i litery. */
async function markBackground(mark) {
  const { data } = await sharp(SOURCE)
    .extract({ left: mark.left + Math.round(mark.width / 2), top: mark.top + Math.round(mark.height * 0.1), width: 1, height: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2] };
}

const written = [];

function emit(relativePath, buffer) {
  writeFileSync(at(relativePath), buffer);
  written.push(`${relativePath} (${(buffer.length / 1024).toFixed(1)} kB)`);
}

const mark = await markRect(SOURCE);
const markPng = await sharp(SOURCE).extract(mark).png(png).toBuffer();

// Znak w rozdzielczości źródłowej. Nie powiększamy: w nagłówku i stopce
// wyświetla się w 40-44 px, więc nawet ekran o potrójnej gęstości mieści się
// w tym, co daje logo.
emit('src/assets/brand/logo-mark.png', markPng);
emit('public/logo-mark.png', markPng);

// Ikona karty przeglądarki. Wyświetlana w 16-32 px, ale system operacyjny
// bierze ją też do skrótów, więc zostawiamy zapas.
emit('public/favicon.png', await sharp(markPng).resize(96, 96).png(png).toBuffer());

// Ikona ekranu głównego w iOS. Bez przezroczystości, bo system podkłada pod nią
// biel - narożniki zaokrągla sobie sam.
const background = await markBackground(mark);
emit(
  'public/apple-touch-icon.png',
  await sharp(markPng).resize(180, 180).flatten({ background }).png(png).toBuffer(),
);

// Obrazek Open Graph. Znak wchodzi w szablon jako `<image>` w base64, bo
// librsvg nie sięgnie po plik z dysku bez podania mu ścieżki bazowej.
const markForOg = await sharp(markPng).resize(200, 200).png(png).toBuffer();
const template = readFileSync(OG_TEMPLATE, 'utf8');
if (!template.includes('<!--MARK-->')) {
  throw new Error('szablon og-image.svg nie ma znacznika <!--MARK--> - nie wiem, gdzie wstawić znak');
}
const og = template.replace(
  '<!--MARK-->',
  `<image x="80" y="80" width="100" height="100" href="data:image/png;base64,${markForOg.toString('base64')}"/>`,
);
emit(
  'public/og-image.png',
  await sharp(Buffer.from(og), { density: 72 }).resize(1200, 630).png({ compressionLevel: 9, effort: 10 }).toBuffer(),
);

console.log(`Znak wycięty z logo.png: ${mark.width}x${mark.height} px (od ${mark.left}, ${mark.top}).`);
for (const line of written) console.log(`  ${line}`);
