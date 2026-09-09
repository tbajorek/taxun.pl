import type { APIRoute } from 'astro';
import { getPostAuthor, getSortedPosts, slugify } from '../../lib/blog';

/**
 * Lekki indeks artykułów dla wyszukiwarki na liście "Wiedza".
 * Pobierany przez przeglądarkę dopiero przy pierwszym wyszukiwaniu, dzięki czemu
 * pierwsze wejście na listę nie ciągnie danych wszystkich artykułów.
 */
export const GET: APIRoute = async () => {
  const posts = await getSortedPosts();
  const index = posts.map((post) => ({
    slug: post.id,
    title: post.data.title,
    description: post.data.description,
    category: post.data.category,
    // Slug kategorii - po nim wyszukiwarka odświeża filtry kategorii przy wynikach.
    categorySlug: slugify(post.data.category),
    tags: post.data.tags,
    author: getPostAuthor(post).name,
    initials: getPostAuthor(post).initials,
    date: post.data.pubDate.toISOString(),
    ...(post.data.readingTime ? { readingTime: post.data.readingTime } : {}),
  }));

  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=86400',
    },
  });
};
