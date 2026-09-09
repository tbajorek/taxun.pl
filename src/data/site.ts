import { founder } from './team';
import { priceMax, priceMin } from './pricing';
import { pct } from '../lib/format';
import { RYCZALT_IT, RYCZALT_MEDYCZNY } from '../lib/tax-constants';

/**
 * Publiczny adres kontaktowy, wystawiony jako osobny eksport.
 *
 * Skrypty klienckie (formularz kontaktowy i kreator wyceny) potrzebują wyłącznie
 * tej jednej wartości. Importowanie całego obiektu `site` wciągało do bundla
 * przeglądarki komplet konfiguracji razem z adresem rejestrowym, czyli adresem
 * prywatnym - a ten nie ma czego szukać w pliku pobieranym przez każdego gościa.
 */
export const contactEmail = 'kontakt@taxun.pl';

export const site = {
  name: 'Taxun',
  brandOwner: 'Tomedio Tomasz Bajorek',
  legalName: 'Tomedio Tomasz Bajorek',
  tagline: 'Nowoczesne biuro rachunkowe online',
  url: 'https://taxun.pl',
  defaultLocale: 'pl-PL',
  email: contactEmail,
  founderEmail: founder.email,
  phoneDisplay: '+48 451 461 377',
  phoneHref: '+48451461377',
  /**
   * Lokalizacja podawana publicznie: samo miasto, bez ulicy i numeru lokalu.
   * Pracujemy w 100% online, więc klient nie ma pod jaki adres przyjechać,
   * a adres rejestrowy jest adresem prywatnym - stąd ten podział.
   */
  address: {
    city: 'Kraków',
    region: 'małopolskie',
    country: 'Polska',
    countryCode: 'PL',
  },
  /**
   * Adres rejestrowy. Prywatny, więc podajemy go wyłącznie tam, gdzie wymagają
   * tego przepisy: w regulaminie (art. 5 ust. 2 ustawy o świadczeniu usług drogą
   * elektroniczną) i w polityce prywatności (art. 13 RODO - dane administratora).
   * Nie wolno go używać w treści marketingowej, w danych strukturalnych, w mapach
   * ani w znacznikach geolokalizacji.
   */
  legalAddress: {
    street: 'ul. Wielicka 113/69',
    postal: '30-552',
  },
  taxId: {
    nip: '6793255895',
    vatId: 'PL6793255895',
    regon: '523958988',
  },
  hours: 'pn - pt: 8:00 - 18:00',
  hoursStructured: {
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    opens: '08:00',
    closes: '18:00',
  },
  priceRange: `${priceMin} zł  -  ${priceMax} zł / mies.`,
  areasServed: ['Polska', 'Kraków'],
  social: {
    linkedin: 'https://www.linkedin.com/company/taxun',
    facebook: 'https://www.facebook.com/taxunpl',
    instagram: 'https://www.instagram.com/taxun.pl/',
  },
  // Dane założyciela pochodzą z konfiguracji zespołu (src/data/team.ts),
  // dzięki czemu nie duplikujemy ich między stroną "O nas" a blogiem.
  founder,
  insurance: {
    /** Etykieta - do list i zestawień, gdzie stoi samodzielnie. */
    type: 'OC zawodowa biura rachunkowego (obowiązkowa)',
    /** Ta sama polisa opisana tak, żeby dała się wstawić w środek zdania. */
    phrase: 'obowiązkowe ubezpieczenie OC biura rachunkowego',
    /** Kwoty zapisujemy w złotych, tak jak w całym serwisie. */
    coverage: '1 000 000 zł',
  },
  standards: ['Procedury zgodne z normą ISO 27001', 'Szyfrowanie TLS 1.3', '2FA dla pracowników', 'Pełna zgodność z RODO'],
};

/** Etykieta kategorii branżowej, używana w menu i w okruszkach podstron. */
export const industriesLabel = 'Branże';

/**
 * Podstrony branżowe. Kolejne dopisujemy wyłącznie tutaj - menu główne,
 * stopka i sitemapa czytają tę listę, więc nowa branża nie wymaga zmian
 * w żadnym z tych miejsc osobno.
 */
export const industries = [
  {
    label: 'Księgowość dla lekarzy',
    href: '/ksiegowosc-dla-lekarzy',
    icon: 'heart',
    description: 'Lekarze, dentyści, fizjoterapeuci, psycholodzy',
  },
  {
    label: 'Księgowość dla programistów',
    href: '/ksiegowosc-dla-programistow',
    icon: 'zap',
    description: `Programiści, testerzy, twórcy gier, IT`,
  },
  {
    label: 'Księgowość dla branży BHP',
    href: '/ksiegowosc-dla-branzy-bhp',
    icon: 'shield',
    description: 'Specjaliści BHP, szkolenia, nadzór, PPOŻ',
  },
  {
    label: 'Księgowość dla marketingu i reklamy',
    href: '/ksiegowosc-dla-marketingu-i-branz-kreatywnych',
    icon: 'sparkle',
    description: 'Agencje, freelancerzy, projektanci, twórcy',
  },
  {
    label: 'Księgowość dla e-commerce',
    href: '/ksiegowosc-dla-e-commerce',
    icon: 'globe',
    description: 'Sklepy internetowe, marketplace, dropshipping',
  },
  {
    label: 'Księgowość dla branży edukacyjnej',
    href: '/ksiegowosc-dla-branzy-edukacyjnej',
    icon: 'award',
    description: 'Szkoleniowcy, korepetytorzy, kursy online, placówki',
  },
  {
    label: 'Księgowość dla branży beauty',
    href: '/ksiegowosc-dla-branzy-beauty',
    icon: 'star',
    description: 'Salony, gabinety, stylistki, fryzjerzy, barberzy',
  },
  {
    label: 'Księgowość dla trenerów i sportowców',
    href: '/ksiegowosc-dla-trenerow-i-sportowcow',
    icon: 'activity',
    description: 'Trenerzy personalni, instruktorzy, kluby, zawodnicy',
  },
  {
    label: 'Księgowość dla kierowców',
    href: '/ksiegowosc-dla-kierowcow',
    icon: 'truck',
    description: 'Taksówkarze, kierowcy aplikacji, kurierzy, przewoźnicy',
  },
  {
    label: 'Księgowość dla nieruchomości i najmu',
    href: '/ksiegowosc-dla-nieruchomosci-i-najmu',
    icon: 'home',
    description: 'Wynajmujący, apartamenty na doby, pensjonaty, zarządcy',
  },
];

export const navigation = [
  { label: 'Usługi', href: '#', children: [
    { label: 'Księgowość', href: '/ksiegowosc', icon: 'calculator', description: 'KPiR, ryczałt, księgi handlowe' },
    { label: 'Księgowość online', href: '/ksiegowosc-online', icon: 'globe', description: 'Portal klienta, KSeF, obsługa zdalna' },
    { label: 'Kadry i płace', href: '/kadry-place', icon: 'users', description: 'Pełna obsługa pracowników i ZUS' },
  ]},
  { label: industriesLabel, href: '#', children: industries },
  { label: 'Cennik', href: '/cennik' },
  { label: 'Kalkulatory', href: '/kalkulatory' },
  { label: 'Wiedza', href: '/wiedza' },
  { label: 'O nas', href: '/o-nas' },
  { label: 'Kontakt', href: '/kontakt' },
];
