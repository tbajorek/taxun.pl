/*
 * Zdjęcie w hero na stronie głównej.
 *
 * Nie importujemy pliku wprost, bo podmienia go właściciel serwisu, a nie kod:
 * wystarczy wrzucić własne zdjęcie do `src/assets/hero/` i poprawić opis niżej.
 * Import z `src/assets/` (a nie odnośnik do `public/`) daje nazwę z odciskiem
 * treści, roczny nagłówek pamięci podręcznej i warianty AVIF/WebP składane
 * w budowaniu.
 *
 * Dopóki katalog jest pusty, hero pokazuje wariant zapasowy - panel ze
 * statusem rozliczeń. Nic nie trzeba wtedy wyłączać ręcznie.
 */
import type { ImageMetadata } from 'astro';

const files = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/hero/*.{jpg,jpeg,png,webp,avif}',
  { eager: true },
);

// Sortujemy po nazwie, żeby przy dwóch plikach w katalogu wybór był
// powtarzalny, a nie zależny od kolejności odczytu katalogu.
const [path] = Object.keys(files).sort();

export const heroPhoto: ImageMetadata | null = path ? files[path].default : null;

/**
 * Opis zdjęcia dla czytników ekranu i wyszukiwarek. Zdjęcie niesie treść
 * (pokazuje, kto prowadzi biuro), więc nie zostawiamy pustego `alt`.
 * Po podmianie pliku zmień to zdanie na to, co faktycznie widać.
 */
export const heroPhotoAlt = 'Zespół biura rachunkowego Taxun przy pracy';
