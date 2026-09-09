/**
 * Weryfikacja zliczania artykułów w zbudowanym serwisie.
 *
 * Skrypt liczy artykuły niezależnie - bezpośrednio z plików w src/content/blog -
 * i porównuje wynik z tym, co faktycznie znalazło się w zbudowanych stronach:
 * licznikami autora i kategorii, liczbą stron paginacji, sitemapą i indeksem
 * wyszukiwarki. Dzięki temu każda rozjazd między liczbą a treścią wychodzi od razu.
 *
 * Uruchomienie: npm run build && npm run check:blog
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIRS = ['.vercel/output/static', 'dist'];
const outDir = OUT_DIRS.find((d) => existsSync(d));
if (!outDir) {
  console.error('Nie znaleziono katalogu z buildem. Uruchom najpierw: npm run build');
  process.exit(1);
}

const PL_CHARS = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
const slugify = (v) =>
  v.toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => PL_CHARS[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const plural = (n, one, few, many) => {
  const a = Math.abs(n);
  if (a === 1) return one;
  const m10 = a % 10;
  const m100 = a % 100;
  return m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14) ? few : many;
};
const articleCount = (n) => `${n} ${plural(n, 'artykuł', 'artykuły', 'artykułów')}`;

const blogLib = readFileSync('src/lib/blog.ts', 'utf8');
const PER_PAGE = Number(blogLib.match(/POSTS_PER_PAGE = (\d+)/)[1]);
const teamSrc = readFileSync('src/data/team.ts', 'utf8');
const DEFAULT_AUTHOR = teamSrc.match(/DEFAULT_AUTHOR_ID = '([^']+)'/)[1];

// Osoby z konfiguracji zespołu: id -> { name, initials }. Parsujemy plik tekstowo,
// bo skrypt działa na gotowym buildzie i nie uruchamia warstwy TypeScriptu.
const teamMembers = new Map(
  [...teamSrc.matchAll(/id: '([^']+)',\s*\n\s*name: '([^']+)',[\s\S]*?initials: '([^']+)',/g)]
    .map((m) => [m[1], { name: m[2], initials: m[3] }])
);

// --- źródło prawdy: pliki artykułów ---
const posts = readdirSync('src/content/blog')
  .filter((f) => f.endsWith('.md'))
  .map((file) => {
    const raw = readFileSync(join('src/content/blog', file), 'utf8');
    const fm = raw.split('---')[1] ?? '';
    const read = (key) => fm.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?\\s*$`, 'm'))?.[1]?.trim();
    return {
      slug: file.replace(/\.md$/, ''),
      author: read('author') ?? DEFAULT_AUTHOR,
      category: read('category'),
      featured: /^featured:\s*true\s*$/m.test(fm),
    };
  });

const byAuthor = new Map();
const byCategory = new Map();
for (const p of posts) {
  byAuthor.set(p.author, (byAuthor.get(p.author) ?? 0) + 1);
  const slug = slugify(p.category);
  byCategory.set(slug, (byCategory.get(slug) ?? 0) + 1);
}

const failures = [];
const checks = [];
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, ok, actual, expected });
  if (!ok) failures.push(`${name}\n    oczekiwano: ${JSON.stringify(expected)}\n    otrzymano:  ${JSON.stringify(actual)}`);
};

const html = (path) => {
  const file = join(outDir, path, 'index.html');
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
};
const postLinks = (doc) =>
  [...doc.matchAll(/href="\/wiedza\/([a-z0-9-]+)"/g)]
    .map((m) => m[1])
    .filter((slug) => posts.some((p) => p.slug === slug));

// --- 1. paginacja głównej listy: każdy artykuł dokładnie raz ---
const featured = posts.find((p) => p.featured) ?? posts[0];
const paginated = posts.filter((p) => p.slug !== featured?.slug);
const expectedPages = Math.max(1, Math.ceil(paginated.length / PER_PAGE));

const seen = [];
for (let page = 1; page <= expectedPages; page += 1) {
  const doc = html(page === 1 ? 'wiedza' : `wiedza/strona/${page}`);
  if (!doc) {
    failures.push(`Brak wygenerowanej strony listy nr ${page}`);
    continue;
  }
  seen.push(...postLinks(doc));
}
check(
  'Lista /wiedza obejmuje każdy artykuł dokładnie raz',
  [...new Set(seen)].sort(),
  posts.map((p) => p.slug).sort()
);
check('Lista /wiedza nie duplikuje artykułów między stronami', seen.length, new Set(seen).size);
check(
  'Nie powstała nadmiarowa strona listy',
  existsSync(join(outDir, 'wiedza/strona', String(expectedPages + 1), 'index.html')),
  false
);

// --- 2. archiwa autorów ---
for (const [author, expected] of byAuthor) {
  const pages = Math.max(1, Math.ceil(expected / PER_PAGE));
  const collected = [];
  for (let page = 1; page <= pages; page += 1) {
    const doc = html(page === 1 ? `wiedza/autor/${author}` : `wiedza/autor/${author}/${page}`);
    if (!doc) {
      failures.push(`Brak archiwum autora ${author}, strona ${page}`);
      continue;
    }
    collected.push(...postLinks(doc));
    if (page === 1) {
      check(
        `Opis archiwum autora ${author} podaje poprawną liczbę`,
        doc.includes(`Łącznie ${articleCount(expected)}`),
        true
      );
    }
  }
  check(
    `Archiwum autora ${author} zawiera dokładnie jego artykuły`,
    [...new Set(collected)].sort(),
    posts.filter((p) => p.author === author).map((p) => p.slug).sort()
  );
}

// --- 3. autor na stronie artykułu: podpis, box "O autorze", metadane, licznik ---
// Rozjazd między autorem z frontmattera a tym, co widzi czytelnik, jest cichy -
// strona wygląda poprawnie, tylko pod cudzym nazwiskiem. Dlatego sprawdzamy każde
// miejsce, w którym artykuł przedstawia autora, a nie sam licznik artykułów.
for (const p of posts) {
  const doc = html(`wiedza/${p.slug}`);
  if (!doc) {
    failures.push(`Brak strony artykułu ${p.slug}`);
    continue;
  }
  const member = teamMembers.get(p.author);
  if (!member) {
    failures.push(`Artykuł ${p.slug} wskazuje autora ${p.author}, którego nie ma w src/data/team.ts`);
    continue;
  }

  check(
    `Podpis pod tytułem w artykule ${p.slug} wskazuje autora ${p.author}`,
    doc.match(/class="article-hero__author-link"[^>]*href="\/wiedza\/autor\/([a-z0-9-]+)"[^>]*>([^<]+)</)?.slice(1, 3),
    [p.author, member.name]
  );
  check(
    `Box "O autorze" w artykule ${p.slug} opisuje autora ${p.author}`,
    doc.includes(`aria-label="O autorze: ${member.name}"`),
    true
  );
  check(
    `Dane strukturalne artykułu ${p.slug} wskazują autora ${p.author}`,
    doc.match(/"@id":"[^"]*#article"[\s\S]*?"author":\{"@id":"https:\/\/taxun\.pl\/#([a-z0-9-]+)"\}/)?.[1],
    p.author
  );
  check(
    `Meta name="author" w artykule ${p.slug}`,
    doc.match(/<meta name="author" content="([^"]+)"/)?.[1],
    member.name
  );

  const shown = Number(doc.match(/Zobacz wszystkie artykuły autora \((\d+)\)/)?.[1]);
  check(`Licznik autora w artykule ${p.slug}`, shown, byAuthor.get(p.author));
}

// --- 4. liczniki kategorii przy filtrach + zawartość archiwów ---
const listDoc = html('wiedza');
for (const [slug, expected] of byCategory) {
  const shown = Number(
    listDoc?.match(
      new RegExp(`href="/wiedza/kategoria/${slug}"[^>]*>[^<]*<span class="blog-filter__count"[^>]*>(\\d+)<`)
    )?.[1]
  );
  check(`Licznik kategorii ${slug} przy filtrach`, shown, expected);

  const pages = Math.max(1, Math.ceil(expected / PER_PAGE));
  const collected = [];
  for (let page = 1; page <= pages; page += 1) {
    const doc = html(page === 1 ? `wiedza/kategoria/${slug}` : `wiedza/kategoria/${slug}/${page}`);
    if (!doc) {
      failures.push(`Brak archiwum kategorii ${slug}, strona ${page}`);
      continue;
    }
    collected.push(...postLinks(doc));
  }
  check(
    `Archiwum kategorii ${slug} zawiera dokładnie swoje artykuły`,
    [...new Set(collected)].sort(),
    posts.filter((p) => slugify(p.category) === slug).map((p) => p.slug).sort()
  );
}

// --- 5. sitemap i indeks wyszukiwarki ---
const sitemap = readFileSync(join(outDir, 'sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>https:\/\/taxun\.pl([^<]*)<\/loc>/g)].map((m) => m[1]);
check('Sitemap zawiera każdy artykuł', posts.every((p) => locs.includes(`/wiedza/${p.slug}`)), true);
check(
  'Sitemap zawiera archiwum każdego autora z artykułami',
  [...byAuthor.keys()].every((a) => locs.includes(`/wiedza/autor/${a}`)),
  true
);
check(
  'Sitemap nie zawiera archiwum autora bez artykułów',
  locs.filter((l) => l.startsWith('/wiedza/autor/')).length,
  [...byAuthor].reduce((sum, [, c]) => sum + Math.max(1, Math.ceil(c / PER_PAGE)), 0)
);
check('Sitemap nie ma duplikatów', locs.length, new Set(locs).size);

const index = JSON.parse(readFileSync(join(outDir, 'wiedza/index.json'), 'utf8'));
check('Indeks wyszukiwarki zawiera wszystkie artykuły', index.length, posts.length);
check(
  'Indeks wyszukiwarki podaje autora zgodnego z konfiguracją postów',
  index.map((e) => [e.slug, e.author]).sort(),
  posts.map((p) => [p.slug, teamMembers.get(p.author)?.name]).sort()
);

const feed = readFileSync(join(outDir, 'wiedza/feed.xml'), 'utf8');
for (const p of posts) {
  const item = feed.split('<item>').find((chunk) => chunk.includes(`/wiedza/${p.slug}<`));
  check(
    `RSS podaje autora artykułu ${p.slug}`,
    item?.match(/<dc:creator><!\[CDATA\[([^\]]+)\]\]><\/dc:creator>/)?.[1],
    teamMembers.get(p.author)?.name
  );
}

// --- podsumowanie ---
for (const c of checks) console.log(`${c.ok ? '  ok  ' : ' BŁĄD '} ${c.name}`);
console.log(`\n${posts.length} artykułów, ${byAuthor.size} autor(ów), ${byCategory.size} kategorii, ${PER_PAGE} na stronę`);

if (failures.length) {
  console.error(`\n${failures.length} niezgodność(ci):\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log(`Wszystkie ${checks.length} sprawdzeń przeszło.`);
