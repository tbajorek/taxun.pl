import pageLegalUpdatedRaw from './legal-updated.json';

/**
 * Zastrzeżenie prawne - jedno źródło prawdy dla całego serwisu.
 *
 * Powód, dla którego ten tekst leży w konfiguracji, a nie w treści stron, jest
 * ten sam co przy cenniku: klauzula wpisana ręcznie w kilkunastu miejscach po
 * roku brzmi w każdym z nich inaczej, a w kolejnych kilkunastu w ogóle jej nie
 * ma. Przed wprowadzeniem tego pliku klauzulę miały cztery artykuły z dziesięciu
 * i sześć kalkulatorów z szesnastu, w trzech różnych wersjach.
 *
 * Zastrzeżenie mówi dwie rzeczy i obie muszą być prawdziwe:
 *
 * 1. **Czym ta treść jest.** Materiał ogólny, skierowany do nieoznaczonego
 *    odbiorcy, nie jest czynnością doradztwa podatkowego z art. 2 ust. 1 pkt 1
 *    ustawy o doradztwie podatkowym - ten przepis mówi o poradach dotyczących
 *    obowiązków konkretnego podatnika. Zastrzeżenie tego nie tworzy, tylko
 *    nazywa; gdyby treść faktycznie była poradą indywidualną, żadna formuła by
 *    tego nie odwróciła.
 * 2. **Że przepisy się zmieniają.** Zdanie o sprawdzeniu aktualnego stanu
 *    prawnego jest prawdziwe zawsze i nie wymaga pilnowania kalendarzem.
 *
 * Czego tu świadomie NIE ma: wyłączenia odpowiedzialności. Postanowienie
 * wyłączające albo istotnie ograniczające odpowiedzialność wobec konsumenta
 * jest klauzulą niedozwoloną (art. 385(3) pkt 2 Kodeksu cywilnego), więc
 * zdanie „nie ponosimy odpowiedzialności za skutki" byłoby bezskuteczne,
 * a przy okazji ryzykowne. Opis charakteru treści działa, wyłączenie nie.
 *
 * Zmiana brzmienia: tutaj i nigdzie indziej. Zmiana miejsca, w którym się
 * pokazuje: `src/components/LegalNotice.astro`.
 */

/** Nagłówek ramki. */
export const legalNoticeTitle = 'Zastrzeżenie';

/**
 * Wspólna treść zastrzeżenia. Każdy akapit osobno - komponent renderuje je
 * jako kolejne `<p>`. To, co dotyczy jednej konkretnej strony (kreator wyceny,
 * kalkulatory), dokładamy na tej stronie przez `<slot>`, a nie tutaj - inaczej
 * ten plik po kilku miesiącach zamienia się w zbiór wariantów.
 */
export const legalNotice = [
  'Treści w tym serwisie mają charakter informacyjny i ogólny. Nie są czynnością doradztwa podatkowego w rozumieniu art. 2 ust. 1 ustawy z dnia 5 lipca 1996 r. o doradztwie podatkowym ani poradą prawną w indywidualnej sprawie. Nie znamy Twoich umów, kosztów ani historii rozliczeń, więc nie możemy ocenić, czy opisane tu rozwiązanie jest dla Ciebie właściwe.',
  'Przepisy podatkowe zmieniają się często, także w trakcie roku. Przed podjęciem decyzji sprawdź aktualny stan prawny albo napisz do nas - przejdziemy przez Twoją sytuację konkretnie.',
];

/**
 * Skrócona wersja do stopki - widoczna na każdej podstronie, także tam, gdzie
 * pełna ramka byłaby przesadą (kontakt, o nas, lista artykułów).
 *
 * Celowo krótsza niż ramka, a nie identyczna: na stronie z ramką te dwa teksty
 * stoją w jednym dokumencie i powtórzone słowo w słowo czytałyby się jak błąd.
 * Stopka mówi minimum, ramka dokłada powód i datę.
 */
export const footerDisclaimer =
  'Treści w serwisie mają charakter informacyjny i nie stanowią doradztwa podatkowego ani porady prawnej w indywidualnej sprawie.';

/** Data w formacie „4 września 2026" - podpis pod materiałem. */
const dateFormatter = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatLegalDate(date: Date): string {
  return dateFormatter.format(date);
}

/**
 * Daty przeglądu stron spoza bloga - `src/data/legal-updated.json`.
 *
 * Artykuł niesie własną datę w frontmatterze (`updatedDate`, a bez niej
 * `pubDate`), więc go w tym pliku nie ma. Strony ofertowe i branżowe takiej
 * daty nie mają skąd wziąć, a podają konkretne stawki i limity - dlatego
 * trzymamy je osobno, kluczem jest ścieżka.
 *
 * Dlaczego JSON, a nie mapa wprost w tym pliku: dane mają być edytowalne bez
 * czytania kodu wokół nich. Zmiana daty po przeglądzie strony to podmiana
 * jednej wartości w pliku, który nie zawiera niczego poza datami.
 *
 * Wpis w tym pliku sam wstawia ramkę na stronie - `BaseLayout` sprawdza adres
 * i renderuje zastrzeżenie pod treścią. Nowa podstrona branżowa potrzebuje
 * jednej linii w JSON-ie i niczego więcej.
 *
 * Strony, które mają do dodania własne zdanie (kreator wyceny, słownik,
 * kalkulatory, artykuły), wstawiają `<LegalNotice>` u siebie i dlatego ich tu
 * nie ma - inaczej zastrzeżenie pokazałoby się na nich dwa razy.
 *
 * Daty NIE aktualizujemy automatycznie przy zmianie pliku strony i to jest
 * decyzja, a nie brak czasu. Data mówi „stan prawny sprawdzony", czyli że ktoś
 * przejrzał stawki. Bump przy każdej edycji zmieniłby jej znaczenie na „plik
 * ruszony", a to co innego: w historii repozytorium 20 z 54 commitów
 * dotykających tych stron nie miało nic wspólnego ze stawkami (dane
 * strukturalne, menu, układ). Data przestawiona przez skrypt przy zmianie
 * klasy CSS jest gorsza niż data stara, bo stara zachęca do sprawdzenia,
 * a świeża i nieprawdziwa usypia.
 */
const updated: Record<string, string> = pageLegalUpdatedRaw;

/**
 * Data przeglądu dla podanego adresu. Ścieżkę normalizujemy, bo Astro potrafi
 * podać ją z końcowym ukośnikiem (`/cennik/`), a klucz zapisujemy bez niego.
 */
export function legalUpdatedFor(pathname: string): Date | null {
  const key = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  const iso = updated[key];
  return iso ? new Date(iso) : null;
}
