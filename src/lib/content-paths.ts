/**
 * Ścieżki do treści - w jednym miejscu, bo korzysta z nich zarówno definicja
 * kolekcji (src/content.config.ts), jak i warstwa odczytu (src/lib/blog.ts).
 */

/** Katalog z artykułami, względem katalogu głównego projektu. */
export const BLOG_CONTENT_DIR = './src/content/blog';

/** Rozszerzenie plików artykułów (zgodne ze wzorcem glob w kolekcji). */
export const BLOG_CONTENT_EXT = '.md';

/** Wzorzec glob dla plików artykułów. */
export const BLOG_CONTENT_PATTERN = `**/*${BLOG_CONTENT_EXT}`;
