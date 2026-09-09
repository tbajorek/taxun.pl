/**
 * Konfiguracja zespołu Taxun.
 *
 * Jedno miejsce, w którym definiujemy wszystkie osoby publicznie występujące
 * na stronie. Obecnie dane są wykorzystywane na blogu (autor artykułu, box
 * "O autorze", archiwum artykułów autora), ale struktura jest przygotowana
 * pod przyszłą sekcję "Zespół" / "Pracownicy".
 *
 * Aby dodać nową osobę:
 *   1. dopisz wpis do tablicy `team` (unikalne `id` - to jednocześnie slug URL),
 *   2. w poście ustaw `author: "<id>"` w frontmatterze.
 *
 * UWAGA: Anna Wiśniewska i Marta Zielińska to na razie dane przykładowe, dodane
 * po to, żeby konfiguracja miała więcej niż jednego autora. Zanim przypiszesz im
 * artykuł albo pokażesz je w sekcji "Zespół", podmień wpisy na dane prawdziwych
 * pracowników albo je usuń.
 */

export interface TeamMember {
  /** Unikalny identyfikator - używany w frontmatterze postów i w URL-u archiwum autora. */
  id: string;
  /** Imię i nazwisko. */
  name: string;
  /** Krótka rola - wyświetlana przy podpisie pod tytułem artykułu. */
  role: string;
  /** Pełne stanowisko - wyświetlane w boxie "O autorze" i w danych strukturalnych. */
  jobTitle: string;
  /** Inicjały na awatar (gdy nie ma zdjęcia). */
  initials: string;
  /** Krótki opis - jedno zdanie, np. do kafelka w sekcji "Zespół". */
  shortBio: string;
  /** Pełne bio - wyświetlane w boxie "O autorze" pod artykułem. */
  bio: string;
  /** Służbowy e-mail. Pomiń, jeśli osoba nie udostępnia adresu publicznie. */
  email?: string;
  /** Profil LinkedIn. */
  linkedin?: string;
  /** Zdjęcie w /public (np. '/founder.jpg'). Bez niego renderujemy awatar z inicjałami. */
  photo?: string;
  /** Wariant WebP zdjęcia. */
  photoWebp?: string;
  /** Kanoniczna podstrona o tej osobie - trafia do schema.org jako `url`. */
  profileUrl?: string;
  /** Obszary specjalizacji - trafiają do schema.org `knowsAbout`. */
  knowsAbout?: string[];
  /** Czy to założyciel firmy. */
  isFounder?: boolean;
  /** Czy pokazywać osobę w przyszłej sekcji "Zespół". */
  listed?: boolean;
  /** Kolejność na liście zespołu (rosnąco). */
  order?: number;
}

export const team: TeamMember[] = [
  {
    id: 'tomasz-bajorek',
    name: 'Tomasz Bajorek',
    role: 'Założyciel Taxun',
    jobTitle: 'Informatyk i przedsiębiorca',
    initials: 'TB',
    shortBio: 'Założyciel Taxun. Odpowiada za produkt, technologię i kontakt z klientami.',
    bio: 'Założyciel Taxun, przedsiębiorca z około 10-letnim doświadczeniem w prowadzeniu firm i projektów SaaS. Telefon i mail obsługuje osobiście.',
    email: 'tomasz.bajorek@taxun.pl',
    linkedin: 'https://www.linkedin.com/in/tomasz-bajorek-511739a5/',
    photo: '/founder.jpg',
    photoWebp: '/founder.webp',
    profileUrl: '/o-nas',
    knowsAbout: ['Księgowość', 'KSeF', 'Podatki', 'JDG', 'Spółki z o.o.', 'IP Box', 'Programowanie', 'Krajowy System e-Faktur'],
    isFounder: true,
    listed: true,
    order: 1,
  },
  {
    id: 'anna-wisniewska',
    name: 'Anna Wiśniewska',
    role: 'Główna księgowa',
    jobTitle: 'Główna księgowa',
    initials: 'AW',
    shortBio: 'Prowadzi księgi JDG i spółek, odpowiada za rozliczenia VAT i CIT.',
    bio: 'Główna księgowa w Taxun. Od kilkunastu lat prowadzi księgi rachunkowe i podatkową księgę przychodów i rozchodów - od jednoosobowych działalności po spółki z o.o. Na co dzień zajmuje się rozliczeniami VAT, CIT i JPK oraz wdrażaniem KSeF u klientów biura.',
    email: 'anna.wisniewska@taxun.pl',
    knowsAbout: ['Księgowość', 'VAT', 'CIT', 'JPK', 'KSeF', 'Księgi rachunkowe'],
    listed: true,
    order: 2,
  },
  {
    id: 'marta-zielinska',
    name: 'Marta Zielińska',
    role: 'Specjalistka ds. kadr i płac',
    jobTitle: 'Specjalistka ds. kadr i płac',
    initials: 'MZ',
    shortBio: 'Odpowiada za listy płac, dokumentację pracowniczą i rozliczenia ZUS.',
    bio: 'Specjalistka ds. kadr i płac w Taxun. Zajmuje się naliczaniem wynagrodzeń, dokumentacją pracowniczą, umowami cywilnoprawnymi i rozliczeniami z ZUS. Wspiera klientów w tematach zatrudnienia: od pierwszej umowy o pracę po obsługę zasiłków i PPK.',
    email: 'marta.zielinska@taxun.pl',
    knowsAbout: ['Kadry i płace', 'ZUS', 'Umowa o pracę', 'Umowa zlecenie', 'PPK', 'Zasiłki'],
    listed: true,
    order: 3,
  },
];

/** Mapa id -> osoba, do szybkiego odczytu. */
export const teamById: Record<string, TeamMember> = Object.fromEntries(
  team.map((member) => [member.id, member])
);

/** Lista identyfikatorów - wykorzystywana przez schemat kolekcji `blog` do walidacji. */
export const TEAM_IDS = team.map((member) => member.id) as [string, ...string[]];

/** Autor przypisywany postom, które nie wskazują nikogo wprost. */
export const DEFAULT_AUTHOR_ID = 'tomasz-bajorek';

/** Założyciel firmy - wykorzystywany m.in. w danych strukturalnych organizacji. */
export const founder: TeamMember =
  team.find((member) => member.isFounder) ?? teamById[DEFAULT_AUTHOR_ID];

/**
 * Zwraca osobę o podanym id albo `null`, gdy w konfiguracji nikogo takiego nie ma.
 * Dzięki temu wywołujący może odróżnić "nie ma takiej osoby" od "podstaw domyślną" -
 * przy autorze artykułu ciche podstawienie założyciela jest błędem, a nie ratunkiem.
 */
export function findTeamMember(id?: string): TeamMember | null {
  return (id && teamById[id]) || null;
}

/**
 * Zwraca osobę o podanym id. Gdy id jest nieznane (np. post sprzed migracji),
 * używamy domyślnego autora, żeby strona nie wywracała się na braku danych.
 *
 * UWAGA: nie używaj tego do autora artykułu - tam id pochodzi wprost z konfiguracji
 * posta i musi być uszanowane albo zgłoszone jako błąd (patrz `getPostAuthor`).
 */
export function getTeamMember(id?: string): TeamMember {
  return findTeamMember(id) ?? teamById[DEFAULT_AUTHOR_ID];
}

/** Osoby do wyświetlenia w sekcji "Zespół" (na razie nieużywane na stronie). */
export function getListedTeam(): TeamMember[] {
  return team
    .filter((member) => member.listed !== false)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

/** Identyfikator osoby w grafie schema.org, np. https://taxun.pl/#tomasz-bajorek */
export function personSchemaId(member: TeamMember, baseUrl: string): string {
  return `${baseUrl}/#${member.id}`;
}

/** Węzeł `Person` dla schema.org. */
export function personSchema(
  member: TeamMember,
  baseUrl: string,
  organizationId: string
): Record<string, unknown> {
  return {
    '@type': 'Person',
    '@id': personSchemaId(member, baseUrl),
    name: member.name,
    jobTitle: member.jobTitle,
    description: member.bio,
    worksFor: { '@id': organizationId },
    url: `${baseUrl}${member.profileUrl ?? `/wiedza/autor/${member.id}`}`,
    ...(member.photo ? { image: `${baseUrl}${member.photo}` } : {}),
    ...(member.email ? { email: member.email } : {}),
    ...(member.knowsAbout?.length ? { knowsAbout: member.knowsAbout } : {}),
    ...(member.linkedin ? { sameAs: [member.linkedin] } : {}),
  };
}
