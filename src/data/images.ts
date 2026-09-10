/*
 * Zdjęcia używane w treści stron.
 *
 * Katalog `src/assets/images/` jest workiem na obrazki, a kod sięga po nie
 * nazwą pliku bez rozszerzenia: `hero.jpg` to `image('hero')`. Nowy obrazek
 * to więc wrzucenie pliku i dopisanie zdania do `ALT` - bez importu, bez
 * zmiany w komponencie i bez znaczenia, czy to JPEG, PNG, WebP czy AVIF.
 *
 * Import z `src/assets/` (a nie odnośnik do `public/`) jest tu istotny: plik
 * przechodzi przez potok obrazów Astro, więc dostaje warianty AVIF i WebP,
 * nazwę z odciskiem treści i roczny nagłówek pamięci podręcznej z reguły dla
 * `/assets/` w `vercel.json`. W `public/` zostają tylko adresy, które muszą
 * być stałe, bo odwołują się do nich dane strukturalne i Open Graph.
 */
import type { ImageMetadata } from 'astro';

const files = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/images/*.{jpg,jpeg,png,webp,avif}',
  { eager: true },
);

/** Nazwa pliku bez rozszerzenia -> obrazek. */
const byName = new Map<string, ImageMetadata>(
  Object.entries(files).map(([path, module]) => [
    path.slice(path.lastIndexOf('/') + 1, path.lastIndexOf('.')),
    module.default,
  ]),
);

/*
 * Opisy dla czytników ekranu i wyszukiwarek. Zdanie ma mówić, co widać na
 * zdjęciu, więc dopisuje je człowiek, który to zdjęcie widział - kod nie ma
 * czego zgadywać. Obrazek bez wpisu idzie jako ozdoba, z pustym `alt`,
 * i budowanie mówi o tym w konsoli.
 *
 * Nazwy używane przez bloki powitalne podstron: `ksiegowosc`, `kadry-place`
 * i `ksiegowosc-online` - takie same jak adresy tych stron.
 */
const ALT: Record<string, string> = {
  hero: 'Doradca Taxun i klientka przeglądają dokumenty firmowe na tablecie',
};

export interface SiteImage {
  file: ImageMetadata;
  alt: string;
}

/**
 * Obrazek o podanej nazwie albo `null`, gdy pliku nie ma. Strona ma wtedy
 * pokazać wariant bez zdjęcia zamiast wywalić budowanie - dzięki temu można
 * podmienić plik bez dotykania kodu.
 */
export function image(name: string): SiteImage | null {
  const file = byName.get(name);
  if (!file) return null;
  const alt = ALT[name];
  if (alt === undefined) {
    console.warn(
      `[images] Obrazek "${name}" nie ma opisu w ALT (src/data/images.ts) - idzie z pustym alt, czyli jako ozdoba.`,
    );
  }
  return { file, alt: alt ?? '' };
}
