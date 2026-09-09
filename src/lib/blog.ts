import { getCollection, type CollectionEntry } from 'astro:content';
import { existsSync, readdirSync } from 'node:fs';
import { findTeamMember, TEAM_IDS, type TeamMember } from '../data/team';
import { getCover, type Cover } from './covers';
import { BLOG_CONTENT_DIR, BLOG_CONTENT_EXT } from './content-paths';

export type BlogPost = CollectionEntry<'blog'>;

/** Liczba artykułów na jednej stronie listy. */
export const POSTS_PER_PAGE = 9;

const PL_CHARS: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
};

/** Slug URL-owy z polskich znaków, np. "Księgowość" -> "ksiegowosc". */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => PL_CHARS[c] ?? c)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Pliki artykułów leżące na dysku - niezależnie od warstwy treści Astro.
 * Używane wyłącznie do wykrycia rozjazdu (kod działa po stronie serwera).
 */
function countPostFilesOnDisk(): number {
  if (!existsSync(BLOG_CONTENT_DIR)) return 0;
  try {
    return readdirSync(BLOG_CONTENT_DIR, { recursive: true, encoding: 'utf-8' })
      .filter((entry) => entry.endsWith(BLOG_CONTENT_EXT)).length;
  } catch {
    return 0;
  }
}

/**
 * Pusta kolekcja przy niepustym katalogu artykułów to zawsze awaria synchronizacji
 * treści, a nie stan "nie ma jeszcze artykułów". Przerywamy głośno, zamiast cicho
 * wyrenderować pustą listę - inaczej lokalnie widać pusty blog bez wyjaśnienia,
 * a nieudany build mógłby opublikować pustą sekcję Wiedza na produkcji.
 */
function assertCollectionMatchesDisk(loaded: number): void {
  if (loaded > 0) return;
  const onDisk = countPostFilesOnDisk();
  if (onDisk === 0) return;

  throw new Error(
    `Kolekcja "blog" jest pusta, mimo że w ${BLOG_CONTENT_DIR} znajduje się ` +
      `${onDisk} plików ${BLOG_CONTENT_EXT}. Warstwa treści Astro nie zsynchronizowała artykułów. ` +
      'Najczęstsza przyczyna: dev serwer działa w tle od momentu, w którym katalog z artykułami ' +
      'był pusty (przełączenie gałęzi, git stash, pull) - `npm run dev` tylko się do niego podłącza. ' +
      'Napraw: `npx astro dev stop`, a potem `npm run dev`. Jeśli to nie pomoże, wyczyść cache ' +
      'warstwy treści: usuń katalog `.astro` albo uruchom `npm run dev -- --force`.'
  );
}

/** Wszystkie posty, od najnowszego. */
export async function getSortedPosts(): Promise<BlogPost[]> {
  const posts = await getCollection('blog');
  assertCollectionMatchesDisk(posts.length);
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/**
 * Osoba wskazana w konfiguracji posta, rozwiązana do wpisu z src/data/team.ts.
 *
 * Nieznane id jest błędem, a nie powodem do podstawienia założyciela. Ciche
 * podstawienie dawało w przeszłości najgorszy możliwy efekt: artykuł wyglądał
 * poprawnie, tylko pod cudzym nazwiskiem - i to w każdym miejscu naraz
 * (podpis, box "O autorze", dane strukturalne, RSS). Lepiej wywalić build.
 */
function resolveMember(post: BlogPost, field: 'author' | 'reviewer', id: unknown): TeamMember {
  const member = typeof id === 'string' ? findTeamMember(id) : null;
  if (member) return member;

  throw new Error(
    `Artykuł "${post.id}" wskazuje w polu \`${field}\` osobę ${JSON.stringify(id)}, ` +
      `której nie ma w konfiguracji zespołu (src/data/team.ts). ` +
      `Dostępne identyfikatory: ${TEAM_IDS.join(', ')}. ` +
      'Jeśli id wygląda poprawnie, warstwa treści Astro trzyma stary frontmatter tego pliku - ' +
      'usuń katalog `.astro` i uruchom build (albo dev serwer) ponownie.'
  );
}

/** Autor posta rozwiązany do wpisu z konfiguracji zespołu. */
export function getPostAuthor(post: BlogPost): TeamMember {
  return resolveMember(post, 'author', post.data.author);
}

/** Recenzent merytoryczny posta, jeśli został wskazany. */
export function getPostReviewer(post: BlogPost): TeamMember | null {
  return post.data.reviewer ? resolveMember(post, 'reviewer', post.data.reviewer) : null;
}

/**
 * Zdjęcie wyróżniające artykułu - jedyne miejsce, w którym pole `cover`
 * z frontmatteru zamienia się na dane do renderowania. Lista artykułów,
 * archiwa i sama strona artykułu korzystają z tej samej funkcji, więc
 * zdjęcie ustawia się raz, a działa wszędzie.
 */
export function getPostCover(post: BlogPost): Cover | null {
  return getCover(post.data.cover, post.data.coverAlt ?? '', `Artykuł "${post.id}"`);
}

export interface CategoryInfo { name: string; slug: string; count: number }

/**
 * Kategorie występujące w postach wraz z liczbą artykułów.
 *
 * Grupujemy po slugu, a nie po nazwie: "Ryczałt" i "ryczalt" trafiają do tego
 * samego archiwum (/wiedza/kategoria/ryczalt), więc muszą też być zliczane
 * razem. Inaczej licznik przy filtrze pokazywałby co innego niż zawartość
 * archiwum, a paginacja liczyłaby strony ze złej liczby artykułów.
 */
export function collectCategories(posts: BlogPost[]): CategoryInfo[] {
  const bySlug = new Map<string, CategoryInfo>();
  for (const post of posts) {
    const slug = slugify(post.data.category);
    const existing = bySlug.get(slug);
    if (existing) {
      existing.count += 1;
    } else {
      bySlug.set(slug, { name: post.data.category, slug, count: 1 });
    }
  }
  return Array.from(bySlug.values());
}

/**
 * Artykuły danego autora.
 *
 * Porównujemy po rozwiązanym autorze (getPostAuthor), a nie po surowej
 * wartości z frontmattera. Dzięki temu liczba w podpisie "Zobacz wszystkie
 * artykuły autora (N)", zawartość archiwum autora i wpisy w sitemapie zawsze
 * pochodzą z tej samej reguły.
 */
export function getPostsByAuthor(posts: BlogPost[], authorId: string): BlogPost[] {
  return posts.filter((post) => getPostAuthor(post).id === authorId);
}

/** Liczba artykułów danego autora. */
export function countPostsByAuthor(posts: BlogPost[], authorId: string): number {
  return getPostsByAuthor(posts, authorId).length;
}

/** Artykuły z danej kategorii, wybierane po slugu (tak jak buduje je archiwum). */
export function getPostsByCategory(posts: BlogPost[], categorySlug: string): BlogPost[] {
  return posts.filter((post) => slugify(post.data.category) === categorySlug);
}

/**
 * Polska odmiana rzeczownika przez liczbę.
 * 1 artykuł / 2-4 artykuły / 5-21 artykułów / 22-24 artykuły / ...
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count);
  if (abs === 1) return one;
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
}

/** Liczba artykułów z poprawną odmianą, np. "22 artykuły", "0 artykułów". */
export function articleCount(count: number): string {
  return `${count} ${plural(count, 'artykuł', 'artykuły', 'artykułów')}`;
}

/** Najczęściej używane tagi. */
export function collectTags(posts: BlogPost[], limit = 12): string[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pl'))
    .slice(0, limit)
    .map(([tag]) => tag);
}

/** Adres artykułu. */
export function postPath(post: BlogPost): string {
  return `/wiedza/${post.id}`;
}

/** Adres n-tej strony głównej listy artykułów. */
export function blogPath(page = 1): string {
  return page <= 1 ? '/wiedza' : `/wiedza/strona/${page}`;
}

/** Adres n-tej strony archiwum autora. */
export function authorPath(authorId: string, page = 1): string {
  const base = `/wiedza/autor/${authorId}`;
  return page <= 1 ? base : `${base}/${page}`;
}

/** Adres n-tej strony archiwum kategorii. */
export function categoryPath(category: string, page = 1): string {
  const base = `/wiedza/kategoria/${slugify(category)}`;
  return page <= 1 ? base : `${base}/${page}`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('pl-PL', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Wyróżniony artykuł - pokazywany na pierwszej stronie listy. */
export function pickFeatured(posts: BlogPost[]): BlogPost | null {
  return posts.find((post) => post.data.featured) ?? posts[0] ?? null;
}

/** Artykuły do paginacji na głównej liście: wszystkie poza wyróżnionym. */
export function paginatedPosts(posts: BlogPost[], featured: BlogPost | null): BlogPost[] {
  return featured ? posts.filter((post) => post.id !== featured.id) : posts;
}

/** Liczba stron dla podanej liczby elementów. */
export function lastPageOf(total: number, pageSize = POSTS_PER_PAGE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Wycinek elementów dla n-tej strony (numeracja od 1). */
export function pageSlice<T>(items: T[], page: number, pageSize = POSTS_PER_PAGE): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
