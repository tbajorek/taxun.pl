import { OPLATA_WNIOSEK_INTERPRETACJA, OPLATA_WNIOSEK_WIS, WIS_TERMIN_MIESIACE } from '../lib/tax-constants';
import { num } from '../lib/format';

export type DocBucket = {
  range: string;
  upTo: number | null; // null = "powyżej X"
  noVat?: number | 'custom';
  withVat?: number | 'custom';
  price?: number | 'custom'; // for księgi handlowe (single price)
};

export type PricingTable = {
  id: 'ryczalt' | 'kpir' | 'fk';
  name: string;
  shortName: string;
  badge?: string;
  tagline: string;
  icon: string;
  hasVat: boolean; // ryczałt, kpir → true; fk → false
  startsFrom: number;
  buckets: DocBucket[];
  notes?: string[];
};

export const tables: PricingTable[] = [
  {
    id: 'ryczalt',
    name: 'Ryczałt ewidencjonowany',
    shortName: 'Ryczałt',
    tagline: 'Najprostsza forma rozliczenia dla firm usługowych i IT.',
    icon: 'zap',
    hasVat: true,
    startsFrom: 199,
    buckets: [
      { range: 'do 10', upTo: 10, noVat: 199, withVat: 249 },
      { range: '11  -  30', upTo: 30, noVat: 259, withVat: 299 },
      { range: '31  -  50', upTo: 50, noVat: 319, withVat: 369 },
      { range: '51  -  100', upTo: 100, noVat: 399, withVat: 459 },
      { range: '101  -  150', upTo: 150, noVat: 499, withVat: 569 },
      { range: 'powyżej 150', upTo: null, noVat: 'custom', withVat: 'custom' },
    ],
  },
  {
    id: 'kpir',
    name: 'Książka przychodów i rozchodów (KPiR)',
    shortName: 'KPiR',
    badge: 'Najpopularniejsza',
    tagline: 'Klasyka dla jednoosobowej działalności na skali lub liniówce.',
    icon: 'file',
    hasVat: true,
    startsFrom: 249,
    buckets: [
      { range: 'do 10', upTo: 10, noVat: 249, withVat: 299 },
      { range: '11  -  20', upTo: 20, noVat: 299, withVat: 349 },
      { range: '21  -  30', upTo: 30, noVat: 349, withVat: 399 },
      { range: '31  -  50', upTo: 50, noVat: 419, withVat: 479 },
      { range: '51  -  70', upTo: 70, noVat: 499, withVat: 569 },
      { range: '71  -  100', upTo: 100, noVat: 599, withVat: 679 },
      { range: '101  -  150', upTo: 150, noVat: 719, withVat: 809 },
      { range: 'powyżej 150', upTo: null, noVat: 'custom', withVat: 'custom' },
    ],
  },
  {
    id: 'fk',
    name: 'Księgi rachunkowe (pełna księgowość)',
    shortName: 'Księgi handlowe',
    tagline: 'Dla spółek z o.o., komandytowych i akcyjnych - pełna rachunkowość zgodnie z UoR.',
    icon: 'briefcase',
    hasVat: false,
    startsFrom: 999,
    buckets: [
      { range: 'do 10', upTo: 10, price: 999 },
      { range: '11  -  30', upTo: 30, price: 1499 },
      { range: '31  -  50', upTo: 50, price: 1899 },
      { range: '51  -  80', upTo: 80, price: 2199 },
      { range: '81  -  100', upTo: 100, price: 2599 },
      { range: '101  -  150', upTo: 150, price: 2999 },
      { range: 'powyżej 150', upTo: null, price: 'custom' },
    ],
    notes: ['Dopłata za prowadzenie kont zespołu 5 (MPK / centra kosztów): +20% ceny bazowej.'],
  },
];

/**
 * Co wchodzi w abonament - lista, którą pokazujemy jako "all-inclusive".
 *
 * Każda pozycja musi dać się sprawdzić w pozostałej części cennika: nic z tej
 * listy nie ma prawa pojawić się jako płatna pozycja w `additional`, wśród
 * `specialModules` ani w wyliczeniu kreatora. Dlatego dwie pozycje są tu
 * zawężone, a nie podane hasłowo. Import usług jest w cenie u czynnego
 * podatnika VAT, ale u zwolnionego z VAT uruchamia moduł VAT-UE (deklaracja
 * VAT-9M), więc bez tego zastrzeżenia lista obiecywałaby coś, za co obok
 * pobieramy dopłatę. Roczne zeznanie jest w cenie w części dotyczącej
 * działalności, a PIT-37 z dochodów spoza firmy stoi w usługach dodatkowych
 * jako płatny. PIT-28 z najmu prywatnego jest płatny tylko wtedy, gdy jest
 * osobnym drukiem: u ryczałtowca najem wchodzi do tego samego zeznania, które
 * i tak składamy za działalność, więc tam mieści się w abonamencie.
 */
export const includedInPlan = [
  { icon: 'briefcase', label: 'Założenie JDG: CEIDG + ZUS + US + VAT-R' },
  { icon: 'shield', label: 'Obsługa ZUS właściciela JDG' },
  { icon: 'file', label: 'JPK_V7M / JPK_V7K' },
  { icon: 'zap', label: 'KSeF - wysyłka i odbiór e-faktur' },
  { icon: 'sparkle', label: 'OCR dokumentów (faktury z PDF i zdjęć)' },
  { icon: 'globe', label: 'Portal klienta online 24/7' },
  { icon: 'check-circle', label: 'VAT-UE: rejestracja, informacje podsumowujące, WNT i WDT' },
  { icon: 'globe', label: 'Import usług u czynnego podatnika VAT' },
  { icon: 'award', label: 'Roczne zeznanie PIT / CIT z działalności' },
  { icon: 'chart', label: 'Roczne sprawozdanie finansowe i e-sprawozdanie do KRS (KH)' },
];

export type HrItem = { id: string; name: string; price: number; note?: string };
export const hrPricing: HrItem[] = [
  { id: 'uop', name: 'Umowa o pracę - pełna obsługa kadrowo-płacowa', price: 75 },
  { id: 'uop-obco', name: 'Umowa o pracę z obcokrajowcem', price: 95, note: 'akta w PL/EN/UA' },
  { id: 'zlecenie-zus', name: 'Umowa zlecenie / o dzieło - z ZUS', price: 55 },
  { id: 'zlecenie', name: 'Umowa zlecenie / o dzieło - bez ZUS', price: 45 },
  { id: 'obco', name: 'Umowa z obcokrajowcem (zlecenie / dzieło)', price: 65 },
];
export const hrMin = 75;

/**
 * Stawka przyjmowana do szacunków, gdy nie znamy jeszcze rodzaju umów -
 * pełny etat jest najczęstszy i najdroższy z krajowych wariantów, więc
 * szacunek nie zaniża kosztu obsługi.
 */
export const hrStandard = hrPricing.find((h) => h.id === 'uop')?.price ?? hrMin;

/**
 * Stawka godzinowa za pracę rozliczaną czasem: konsultację księgową doraźną
 * i udział w kontroli US albo ZUS. Jedna kwota dla obu pozycji, bo to ta sama
 * praca księgowego - rynek liczy tu zwykle więcej i osobno za każdą z tych
 * sytuacji.
 *
 * Uwaga na nazewnictwo: sprzedajemy godziny pracy księgowego, a nie
 * reprezentację przed organem. Reprezentowanie podatnika w postępowaniu przed
 * organami administracji publicznej to czynność zastrzeżona (art. 2 ust. 1
 * pkt 4 w zw. z ust. 2 ustawy o doradztwie podatkowym) dla doradców
 * podatkowych, adwokatów i radców prawnych - u nas stoi ona osobną pozycją
 * z wyceną podmiotu uprawnionego, a nie w tej stawce.
 */
export const hourlyRate = 150;

/**
 * Konsultacje przed założeniem firmy, przywoływane w treści stron i w FAQ.
 * Trzymamy je tutaj, żeby katalog usług dodatkowych i opisy na stronach nie
 * mogły się rozjechać.
 *
 * To są konsultacje, a nie rejestracja wykonana za klienta, i tak muszą być
 * opisane wszędzie. Nie jest to ostrożnościowa formuła, tylko jedyny zakres,
 * jaki możemy wykonać.
 *
 * Przy jednoosobowej działalności decyduje procedura CEIDG: wniosku
 * o pierwszy wpis nie da się złożyć przez pełnomocnika przez internet.
 * Pełnomocnik może to zrobić wyłącznie osobiście w urzędzie miasta albo
 * gminy, na podstawie pisemnego pełnomocnictwa z oryginałem w załączeniu
 * i z opłatą skarbową 17 zł od każdego złożenia. Biuro pracujące zdalnie nie
 * ma więc jak „przeprowadzić rejestracji za klienta” - wniosek podpisuje
 * i wysyła sam przedsiębiorca, profilem zaufanym albo podpisem
 * kwalifikowanym.
 *
 * Przy spółce wychodzi to samo, tylko z innego przepisu: umowę podpisują
 * wszyscy wspólnicy, wniosek o wpis wszyscy członkowie zarządu
 * (art. 164 § 1 k.s.h.), a pełnomocnikiem przed sądem rejestrowym może być
 * wyłącznie adwokat albo radca prawny (art. 87 § 1 k.p.c.).
 *
 * Roli pełnomocnika w rejestracji nie bierzemy w żadnej z tych procedur -
 * to decyzja właściciela biura, nie tylko skutek przepisów. Sprzedajemy
 * rozmowę: policzone warianty opodatkowania i ZUS, przejście przez formularz
 * na spotkaniu online i sprawdzenie, czy nic nie zostało pominięte. Klika
 * klient. Dlatego pozycje nazywają się „konsultacja”, a nie „założenie
 * firmy”, i nie ma tu wariantu bezpłatnego: pracę wykonujemy tak samo
 * niezależnie od tego, czy dojdzie do stałej współpracy.
 *
 * Pełnomocnictwa, które bierzemy przy stałej obsłudze (UPL-1 do deklaracji,
 * ZUS-PEL, uprawnienia w KSeF), to co innego - dotyczą prowadzenia
 * rozliczeń już działającej firmy, a nie jej rejestracji.
 */
export const setupFees = {
  /** Konsultacja przed założeniem jednoosobowej działalności. */
  jdg: 199,
  /** Konsultacja przed założeniem spółki, razem z przejściem przez S24. */
  s24: 499,
  /**
   * Ile dni od konsultacji ma wejść w życie umowa o obsługę, żeby zaliczyć
   * jej kwotę na poczet pierwszej faktury. Nie ma tu warunku minimalnego
   * czasu współpracy: klient zapłacił z góry, więc nie ma czego dochodzić,
   * gdyby zrezygnował wcześniej.
   */
  creditWithinDays: 30,
};
/**
 * Roczne rozliczenia osobiste właściciela, czyli dochody spoza działalności.
 *
 * Zeznanie z firmy jest w abonamencie, a te dotyczą innego źródła przychodu,
 * więc stoją w usługach dodatkowych. Przy najmie prywatnym liczy się jednak
 * liczba druków, a nie liczba źródeł: najem prywatny rozlicza się ryczałtem,
 * czyli tym samym PIT-28, który składamy za działalność ryczałtowca - najem
 * wchodzi do niego osobną rubryką, a nie osobnym formularzem, i wtedy nie ma
 * za co doliczać. Dopłata dotyczy klienta rozliczającego firmę innym drukiem
 * (skala, liniówka, karta, CIT), bo u niego PIT-28 jest dodatkowym zeznaniem.
 *
 * Kwoty powtarza katalog usług dodatkowych, FAQ na /cennik, podstrona najmu
 * i kreator wyceny, więc trzymamy je tutaj.
 */
export const personalReturns = {
  /** PIT-37 / PIT-36 właściciela z dochodów spoza działalności. */
  personal: 100,
  /** PIT-28 z najmu prywatnego, gdy firma rozlicza się innym drukiem niż PIT-28. */
  rent: 100,
};

/** Warunek dopłaty za PIT-28 z najmu - jedno zdanie dla wszystkich stron. */
export const rentReturnCondition =
  'gdy firma rozlicza się innym drukiem niż PIT-28; u ryczałtowca najem wchodzi do tego samego zeznania i jest w cenie';

/**
 * Zasada, którą powtarza notka pod tabelami cenowymi i FAQ o ukrytych
 * kosztach: publikowany cennik jest ofertą dla nowych umów, a klienta wiąże
 * załącznik do jego własnej umowy. Jedno zdanie w jednym miejscu, żeby obie
 * sekcje nie mogły powiedzieć czegoś innego.
 */
export const currentPricingNote =
  'Cennik na tej stronie dotyczy nowych umów. Klienta obowiązuje wersja cennika stanowiąca załącznik do jego umowy, przez okres tam wskazany.';

/**
 * Faktury walutowe: kilka pierwszych mieści się w abonamencie, każda kolejna
 * jest płatna. Wartości powtarza katalog usług dodatkowych poniżej.
 */
export const currencyInvoices = { freeLimit: 5, rate: 8 };

/**
 * Sprzedaż internetowa: przelicznik zestawień sprzedaży na dokumenty oraz
 * dopłata za kanał sprzedaży.
 *
 * W e-commerce sprzedaż nie trafia do ksiąg pojedynczo, tylko zbiorczym
 * zestawieniem za okres. Liczona jako jeden dokument niezależnie od wielkości
 * sprawiłaby, że sklep z trzema tysiącami zamówień płaciłby tyle samo co
 * sprzedawca z dwudziestoma - a to nie utrzymałoby się dłużej niż kilka
 * miesięcy i skończyło dopłatą albo wypowiedzeniem umowy. Stąd przelicznik.
 *
 * Relacja stu transakcji do dziesięciu pozycji wyciągu nie jest przypadkowa.
 * Pozycja na wyciągu wymaga indywidualnej oceny: identyfikacji, przypisania do
 * kontrahenta i kwalifikacji. Transakcja w zestawieniu sprzedaży przychodzi
 * ustrukturyzowana i jednorodna, w jednym pliku, z tymi samymi polami, więc
 * kosztuje około rząd wielkości mniej pracy.
 *
 * Dopłata za kanał stoi osobno, bo pokrywa inny rodzaj pracy niż wolumen.
 * Wolumen jest liniowy i rozlicza go przelicznik. Kanał wnosi koszt stały:
 * własny format raportu, własną strukturę prowizji i własny cykl wypłat, więc
 * dwa kanały po 50 zamówień to więcej pracy niż jeden kanał ze 100.
 */
export const ecommerce = {
  /** Ile transakcji w zestawieniu sprzedaży mieści się w jednym dokumencie. */
  txPerDoc: 100,
  /** Ile pozycji wyciągu bankowego lub raportu z bramki mieści się w jednym dokumencie. */
  linesPerDoc: 10,
  /** Ile kanałów sprzedaży jest w cenie pakietu. */
  freeChannels: 1,
  /** Każdy kanał sprzedaży ponad limit, miesięcznie. */
  channelRate: 75,
};

/**
 * Procedury szczególne przy sprzedaży do konsumentów za granicą.
 *
 * Do rozliczeń krajowych ich nie doliczamy - rejestracja do VAT-UE i
 * informacje podsumowujące zostają w abonamencie. Osobne pozycje dotyczą
 * wyłącznie procedur OSS i IOSS, bo każda z nich to odrębny obieg: własna
 * rejestracja, własny kalendarz deklaracji, przypisanie stawek obowiązujących
 * w kraju nabywcy i osobny termin płatności. W procedurze IOSS deklaracje
 * składa się co miesiąc, a nie co kwartał, stąd wyższa stawka miesięczna.
 *
 * Rejestracji do VAT w innych krajach nie prowadzimy samodzielnie. Błąd jest
 * tam kosztowny i trudny do naprawienia, więc wskazujemy wyspecjalizowanego
 * partnera i zostajemy przy polskiej części rozliczeń.
 */
export const ossFees = {
  /** Rejestracja do procedury OSS, jednorazowo. */
  ossSetup: 299,
  /** Obsługa procedury OSS: monitorowanie progu, stawki kraju nabywcy, deklaracja kwartalna. */
  ossMonthly: 99,
  /** Rejestracja do procedury IOSS, jednorazowo. */
  iossSetup: 299,
  /** Obsługa procedury IOSS wraz z deklaracjami miesięcznymi. */
  iossMonthly: 149,
};

/**
 * Ulga IP Box - ewidencja odrębna od KPiR i ksiąg rachunkowych.
 *
 * Ustawa wymaga prowadzenia jej na bieżąco, od początku roku podatkowego, więc
 * jest to stała praca w każdym miesiącu, a nie czynność wykonywana raz w roku
 * przy zeznaniu. Stąd stawka miesięczna. Załącznik PIT/IP do rocznego zeznania
 * mieści się w tej stawce - nie pobieramy za niego osobnej opłaty rocznej,
 * inaczej niż część biur, które liczą rozliczenie ulgi jako odrębną usługę.
 *
 * Ewidencję prowadzi się dla każdego kwalifikowanego prawa osobno. Zamiast
 * dopłat za pojedyncze pozycje w ewidencji podajemy stałą stawkę za każde
 * kolejne prawo - kwota jest wtedy przewidywalna z góry.
 */
export const ipBox = {
  /** Ewidencja jednego kwalifikowanego prawa przy KPiR (skala lub liniowy). */
  monthly: 99,
  /** Każde kolejne kwalifikowane prawo w tej samej ewidencji. */
  nextRight: 49,
  /** Ewidencja przy księgach rachunkowych, czyli IP Box w CIT. */
  monthlyFk: 199,
  /** Przygotowanie wniosku o interpretację indywidualną wraz z odpowiedziami na wezwania KIS. */
  interpretation: 1200,
  /** Opłata urzędowa od wniosku - trafia do KIS, nie do biura. */
  interpretationFee: OPLATA_WNIOSEK_INTERPRETACJA,
};

/**
 * Obowiązki wywołane zakupami od podmiotów zagranicznych.
 *
 * Dotyczą przede wszystkim branży marketingowej i kreatywnej: zakup reklam w
 * serwisach zagranicznych rodzi obowiązek informacyjny w podatku u źródła, a
 * subskrypcja narzędzia online oznacza import usług.
 *
 * Podział na to, co wchodzi w abonament, a co jest płatne, wynika z nakładu
 * pracy, a nie z tego, co ładnie wygląda w ofercie:
 *  - weryfikację obowiązku robimy przy okazji księgowania faktur, więc jest
 *    w cenie (część biur liczy za nią osobno),
 *  - rozliczenie importu usług u czynnego podatnika VAT to jeden zapis w
 *    JPK_V7, więc również mieści się w abonamencie,
 *  - u podatnika zwolnionego z VAT ten sam zakup uruchamia odrębny miesięczny
 *    obieg: deklarację VAT-9M, przelew do urzędu i informację podsumowującą.
 *    To praca porównywalna z obsługą czynnego podatnika VAT, stąd dopłata
 *    zbliżająca cenę do stawki z kolumny "z VAT",
 *  - informację IFT-2R składa się osobno dla każdego zagranicznego
 *    kontrahenta, ale drugi i kolejny formularz za ten sam rok powstaje na
 *    zebranych już danych, więc kosztuje mniej niż pierwszy.
 */
export const foreignTax = {
  /** Roczna informacja IFT-2R dla pierwszego zagranicznego kontrahenta. */
  ift2rFirst: 69,
  /** Każda kolejna informacja IFT-2R za ten sam rok podatkowy. */
  ift2rNext: 39,
  /** Deklaracja VAT-9M za miesiąc, w którym u podatnika zwolnionego z VAT wystąpił import usług. */
  vat9m: 49,
};

/**
 * Rabat za powierzenie księgowości i kadr jednocześnie - naliczany od łącznej
 * kwoty obu usług przy zadeklarowanej liczbie pracowników. Odpowiada pozycji
 * "Pakiet księgowość + kadry" z listy rabatów.
 */
/**
 * Wniosek o wiążącą informację stawkową (WIS).
 *
 * Decyzja Dyrektora Krajowej Informacji Skarbowej ustalająca stawkę VAT dla
 * konkretnej usługi albo towaru, wydawana w terminie ustawowym poniżej.
 * Odrębna pozycja, bo to inne postępowanie niż interpretacja indywidualna:
 * spór dotyczy klasyfikacji świadczenia, a nie wykładni przepisu, więc pracy
 * jest mniej - stąd cena poniżej połowy stawki za interpretację.
 *
 * Jeden wniosek obejmuje jedną usługę, a nie cały cennik gabinetu, dlatego
 * podajemy stawkę za pierwszą pozycję i niższą za każdą kolejną w tym samym
 * zleceniu: opis działalności i klasyfikację przygotowujemy raz.
 */
export const wis = {
  /** Przygotowanie wniosku wraz z odpowiedziami na wezwania KIS. */
  first: 600,
  /** Każda kolejna usługa zgłaszana w ramach tego samego zlecenia. */
  next: 300,
  /** Opłata urzędowa od każdej zgłaszanej pozycji - trafia do KIS, nie do biura. */
  fee: OPLATA_WNIOSEK_WIS,
  /** Ustawowy termin wydania decyzji. */
  months: WIS_TERMIN_MIESIACE,
};

export const bundleDiscount = { minEmployees: 3, rate: 0.05 };

/**
 * Moduły specjalne - dopłaty doliczane do pakietu księgowego.
 *
 * Pakiet z tabel powyżej wyceniamy liczbą dokumentów, bo to ona odpowiada za
 * większość pracy. Część obowiązków nie ma jednak z liczbą dokumentów nic
 * wspólnego: biorą się stąd, że firma weszła w konkretną procedurę, i kosztują
 * tyle samo przy dwudziestu dokumentach co przy dwustu. Podatnik zwolniony z
 * VAT, który kupi reklamę w serwisie zagranicznym, musi zarejestrować się do
 * VAT-UE i złożyć VAT-9M niezależnie od tego, ile ma faktur - a wchodząc do
 * kolejnego kraju z procedurą OSS albo na drugą platformę sprzedażową dokłada
 * sobie osobny kalendarz deklaracji, nie kolejne dokumenty.
 *
 * Trzymamy je osobno, żeby cena pakietu została przewidywalna, a klient płacił
 * za moduł tylko wtedy, gdy dany obieg faktycznie u niego występuje. Kwoty
 * biorą się z tych samych stałych, co reszta cennika - moduł jest sposobem
 * pokazania opłaty, a nie nową opłatą.
 */
export type SpecialModule = {
  id: string;
  icon: string;
  name: string;
  /** Stała dopłata miesięczna do pakietu. */
  price: string;
  /** Opłata jednorazowa, gdy moduł wymaga własnej rejestracji. */
  setup?: string;
  /** Kiedy moduł się włącza - warunek po stronie klienta, nie nazwa procedury. */
  when: string;
  note?: string;
};

export const specialModules: SpecialModule[] = [
  {
    id: 'vat-ue',
    icon: 'globe',
    name: 'VAT-UE / import usług',
    price: `+${foreignTax.vat9m} zł / mies.`,
    when: 'Jesteś zwolniony z VAT i kupujesz reklamy, narzędzia albo subskrypcje od firmy zagranicznej.',
    note: 'Rejestracja do VAT-UE i informacja podsumowująca są w abonamencie. Dopłatę liczymy wyłącznie za miesiące, w których import usług wystąpił. U czynnego podatnika VAT ten sam zakup jest w cenie pakietu.',
  },
  {
    id: 'oss',
    icon: 'globe',
    name: 'Procedura VAT OSS',
    price: `+${ossFees.ossMonthly} zł / mies.`,
    setup: `${ossFees.ossSetup} zł jednorazowo`,
    when: 'Sprzedajesz towary lub usługi osobom prywatnym w innych krajach Unii.',
    note: 'Monitorowanie progu, stawki obowiązujące w kraju nabywcy, deklaracja kwartalna i termin płatności. Sprzedaż firmom z Unii rozliczamy w abonamencie.',
  },
  {
    id: 'ioss',
    icon: 'globe',
    name: 'Procedura IOSS',
    price: `+${ossFees.iossMonthly} zł / mies.`,
    setup: `${ossFees.iossSetup} zł jednorazowo`,
    when: 'Sprowadzasz towary spoza Unii i wysyłasz je bezpośrednio do konsumentów.',
    note: 'Stawka wyższa niż w OSS, bo deklaracje składa się co miesiąc, a nie co kwartał.',
  },
  {
    id: 'marketplace',
    icon: 'globe',
    name: 'Amazon / Etsy / eBay / Allegro',
    price: `+${ecommerce.channelRate} zł / mies. za kanał`,
    when: 'Sprzedajesz z więcej niż jednego miejsca - pierwszy kanał jest w cenie pakietu.',
    note: 'Dopłata nie zależy od liczby zamówień, bo każda platforma ma własny format raportu, własną strukturę prowizji i własny cykl wypłat. Wolumen sprzedaży rozlicza osobno przelicznik zestawień.',
  },
  {
    id: 'ip-box',
    icon: 'sparkle',
    name: 'Ewidencja IP Box',
    price: `+${ipBox.monthly} zł / mies.`,
    when: 'Rozliczasz dochód z kwalifikowanego prawa własności intelektualnej.',
    note: `Stawka za jedno prawo przy KPiR, każde kolejne to ${ipBox.nextRight} zł. Przy księgach rachunkowych, czyli IP Box w CIT, ${ipBox.monthlyFk} zł. Wskaźnik nexus i załącznik PIT/IP w cenie modułu.`,
  },
];

/**
 * Usługi dodatkowe: czynności rozliczane od sztuki albo jednorazowo.
 *
 * Stałe dopłaty miesięczne, które włączają w firmie nowy, powtarzalny obieg,
 * stoją osobno w `specialModules` - inaczej moduł znikałby w kilkudziesięciu
 * pozycjach katalogu i klient dowiadywałby się o nim dopiero z faktury.
 */
export type AdditionalService = {
  category: 'free' | 'paid';
  icon: string;
  name: string;
  price: string;
  note?: string;
};

/**
 * Nota przy obu konsultacjach startowych. Jedna stała, bo obie pozycje
 * opisują tę samą granicę: my liczymy i tłumaczymy, klient podpisuje.
 */
const setupConsultationNote =
  `wniosek podpisujesz i składasz samodzielnie - nie jesteśmy pełnomocnikiem w rejestracji; kwotę zaliczamy na poczet pierwszej faktury, jeśli w ciągu ${setupFees.creditWithinDays} dni podpiszesz umowę o obsługę`;

export const additional: AdditionalService[] = [
  { category: 'free', icon: 'shield', name: 'Obsługa ZUS właściciela JDG', price: 'w cenie' },
  { category: 'free', icon: 'file', name: 'Roczne zeznanie PIT / CIT z DG', price: 'w cenie' },
  { category: 'free', icon: 'globe', name: 'Portal klienta + KSeF + OCR', price: 'w cenie' },
  { category: 'free', icon: 'check-circle', name: 'Rejestracja do VAT-UE i informacje podsumowujące', price: 'w cenie' },
  { category: 'free', icon: 'globe', name: 'Pierwszy kanał sprzedaży internetowej', price: 'w cenie', note: 'własny sklep albo jedna platforma sprzedażowa' },
  { category: 'free', icon: 'briefcase', name: 'Porównanie form opodatkowania i wyliczenie ZUS', price: 'w cenie' },
  { category: 'free', icon: 'globe', name: 'Rozliczenie importu usług u czynnego podatnika VAT', price: 'w cenie' },
  { category: 'free', icon: 'search', name: 'Weryfikacja obowiązku w podatku u źródła (WHT)', price: 'w cenie' },
  { category: 'free', icon: 'shield', name: 'Przegląd dotychczasowych rozliczeń pod kątem IFT-2R i importu usług', price: 'w cenie', note: 'jednorazowo, przy zawarciu umowy' },

  { category: 'paid', icon: 'briefcase', name: 'Konsultacja przed założeniem JDG', price: `${setupFees.jdg} zł`, note: setupConsultationNote },
  { category: 'paid', icon: 'briefcase', name: 'Konsultacja przed założeniem spółki (S24)', price: `${setupFees.s24} zł`, note: setupConsultationNote },
  { category: 'paid', icon: 'globe', name: `Faktury walutowe (powyżej ${currencyInvoices.freeLimit} szt./mies.)`, price: `${currencyInvoices.rate} zł / dok.` },
  { category: 'paid', icon: 'file', name: 'Korekta deklaracji podatkowej (z winy klienta)', price: '80 zł / mies.' },
  { category: 'paid', icon: 'shield', name: 'Korekta deklaracji ZUS (z winy klienta)', price: '60 zł / mies.' },
  { category: 'paid', icon: 'briefcase', name: 'Aktualizacja danych w CEIDG / US / ZUS', price: '50 zł' },
  { category: 'paid', icon: 'file', name: 'Wyrejestrowanie z VAT', price: '50 zł' },
  { category: 'paid', icon: 'globe', name: 'Roczna informacja IFT-2R (pierwszy zagraniczny kontrahent)', price: `${foreignTax.ift2rFirst} zł`, note: 'wraz z weryfikacją obowiązku i kompletowaniem certyfikatu rezydencji' },
  { category: 'paid', icon: 'globe', name: 'Roczna informacja IFT-2R - każdy kolejny kontrahent', price: `${foreignTax.ift2rNext} zł` },
  { category: 'paid', icon: 'file', name: 'Sprawozdanie do GUS', price: '50 zł / formularz' },
  { category: 'paid', icon: 'file', name: 'Zaświadczenie o niezaleganiu', price: '50 zł + opłata skarbowa' },
  { category: 'paid', icon: 'chart', name: 'Analiza finansowa / wniosek kredytowy', price: 'od 150 zł' },
  { category: 'paid', icon: 'globe', name: 'Rozliczenie delegacji krajowej', price: '20 zł / delegacja' },
  { category: 'paid', icon: 'globe', name: 'Rozliczenie delegacji zagranicznej', price: '50 zł / delegacja' },
  { category: 'paid', icon: 'users', name: 'Świadectwo pracy', price: '50 zł' },
  { category: 'paid', icon: 'file', name: 'PIT-11 (pracownik spoza obsługi)', price: '80 zł' },
  { category: 'paid', icon: 'file', name: 'PIT-37 / PIT-36 osobisty (właściciel)', price: `${personalReturns.personal} zł` },
  { category: 'paid', icon: 'file', name: 'PIT-28 z najmu prywatnego (właściciel)', price: `${personalReturns.rent} zł`, note: rentReturnCondition },
  { category: 'paid', icon: 'shield', name: 'Obsługa sprawy komorniczej', price: '80 zł / sprawa' },
  { category: 'paid', icon: 'globe', name: 'Zgłoszenie A1 (praca za granicą)', price: '150 zł' },
  { category: 'paid', icon: 'file', name: 'Przechowywanie dokumentów ponad 5 lat', price: '60 zł / rok / segregator' },
  { category: 'paid', icon: 'headset', name: 'Udział w kontroli US / ZUS', price: `${hourlyRate} zł / godz.`, note: 'kompletowanie dokumentacji, zestawienia z ksiąg, wyjaśnienia dotyczące ujęcia zdarzeń, obecność przy czynnościach' },
  { category: 'paid', icon: 'shield', name: 'Reprezentacja przed organami', price: 'wycena indywidualna', note: 'prowadzi ją współpracujący doradca podatkowy, adwokat lub radca prawny - wycenę ustala podmiot uprawniony, a nie biuro' },
  { category: 'paid', icon: 'sparkle', name: 'Konsultacja księgowa (ad hoc)', price: `${hourlyRate} zł / godz.` },
  { category: 'paid', icon: 'file', name: 'Wniosek o interpretację indywidualną', price: `${ipBox.interpretation} zł`, note: `wraz z odpowiedziami na wezwania KIS, plus ${ipBox.interpretationFee} zł opłaty urzędowej od każdego stanu faktycznego` },
  { category: 'paid', icon: 'search', name: 'Wniosek o wiążącą informację stawkową (WIS)', price: `${wis.first} zł`, note: `za pierwszą usługę, ${wis.next} zł za każdą kolejną w tym samym zleceniu, plus ${wis.fee} zł opłaty urzędowej od każdej z nich` },
];

export type Surcharge = { range: string; pct: number; tone: 'good' | 'neutral' | 'warn' | 'bad'; note: string };

/* Progi liczymy dniem miesiąca, w którym komplet dokumentów dociera do biura.
   Pierwszy przedział zaczyna się ósmego dnia, bo wcześniejsze dostarczenie premiuje
   osobny rabat -5%, a ostatni jest otwarty (`to: null`). Dni trzymamy w liczbach,
   bo dzień bez dopłaty powtarza się w treści kilku stron - czytają go stamtąd przez
   `surchargeFreeUntilDay`, zamiast mieć go wpisanego na sztywno. */
type SurchargeStep = { from: number; to: number | null; pct: number; tone: Surcharge['tone']; note: string };
const surchargeSteps: SurchargeStep[] = [
  { from: 8, to: 16, pct: 0, tone: 'good', note: 'Standardowy termin określony w umowie' },
  { from: 17, to: 21, pct: 5, tone: 'warn', note: 'O zbliżającej się dopłacie poinformujemy z wyprzedzeniem' },
  { from: 22, to: 24, pct: 10, tone: 'warn', note: 'Realny koszt pracy wzrasta w obliczu presji terminowej' },
  { from: 25, to: null, pct: 15, tone: 'bad', note: 'Nie gwarantujemy dotrzymania ustawowych terminów' },
];

export const surcharges: Surcharge[] = surchargeSteps.map(({ from, to, pct, tone, note }) => ({
  range: to === null ? `po ${from - 1}. dniu miesiąca` : `${from}. - ${to}. dzień miesiąca`,
  pct,
  tone,
  note,
}));

/** Ostatni dzień miesiąca, w którym przyjmujemy dokumenty bez żadnej dopłaty. */
export const surchargeFreeUntilDay = surchargeSteps[0].to as number;

/** Dopłata za spóźnione dokumenty w formie gotowej do wyświetlenia. */
export const surchargeLabel = (s: Surcharge): string => (s.pct === 0 ? '0 zł' : `+${s.pct}% abonamentu`);

/** Widełki dopłaty za spóźnienie, np. „+5 - 15%” - do zestawień i porównań. */
export const surchargeSpan = `+${surcharges[1].pct} - ${surcharges[surcharges.length - 1].pct}%`;

/* Rabaty lojalnościowe naliczamy za okresy już przepracowane, nigdy z góry.
   Umowa jest na czas nieokreślony, więc nie ma czego wiązać terminem - warunku
   „umowa na 12 miesięcy” nie ma już w umowie i nie wolno go opisywać na
   stronie. Zasadę powtarza `discountsNote` pod kafelkami. */
export type Discount = { icon: string; condition: string; value: string; note?: string };
export const discounts: Discount[] = [
  { icon: 'check-circle', condition: 'Rabat lojalnościowy po 12 miesiącach współpracy', value: '-5%', note: 'naliczany od 13. miesiąca, od stawki abonamentu' },
  { icon: 'award', condition: 'Rabat lojalnościowy po 24 miesiącach współpracy', value: '-10%', note: 'naliczany od 25. miesiąca' },
  { icon: 'sparkle', condition: `Pakiet księgowość + kadry (${bundleDiscount.minEmployees}+ pracowników)`, value: `-${bundleDiscount.rate * 100}%`, note: 'od łącznej kwoty obu usług' },
  { icon: 'clock', condition: 'Terminowe dokumenty (6+ mies. do 7. dnia)', value: '-5%', note: 'rabat za dostarczanie dokumentów przed standardowym terminem' },
  { icon: 'heart', condition: 'Polecenie nowego klienta', value: '-50 zł', note: 'jednorazowo za każdego skutecznie poleconego klienta' },
  { icon: 'briefcase', condition: 'Przejęcie dokumentacji w trakcie roku', value: '0 zł', note: 'darmowe, jeśli dokumenty są uporządkowane' },
];

/** Zdanie pod kafelkami rabatów - warunek, bez którego widać samą obniżkę. */
export const discountsNote =
  'Rabaty naliczamy za okresy już przepracowane, nigdy z góry. Umowa jest na czas nieokreślony, a przy jej zakończeniu nie żądamy zwrotu rabatów.';

/* ── Porównanie z rynkiem ────────────────────────────────────────────────────
   Zestawienie na /cennik#porownanie. Kolumna „typowe biuro” to widełki z
   publicznie dostępnych cenników biur rachunkowych i zestawień rynkowych,
   sprawdzone w miesiącu podanym w `comparisonChecked`. Nazw nie podajemy -
   zestawienie ma pokazywać, za co rynek dolicza osobno, a nie wskazywać palcem
   konkretne biuro.

   Zasady, bez których to zestawienie przestaje być rzetelne:
    - każdy wiersz ma pokrycie w cenniku, który da się otworzyć w przeglądarce;
      wrażenia i opinie z forów nie wchodzą,
    - dolną granicę widełek bierzemy z najtańszej znalezionej oferty, nawet
      jeśli zawęża różnicę - zawyżona dolna granica jest tym, co czyni takie
      tabele niewiarygodnymi,
    - kolumna „Taxun” musi wynikać z tego pliku albo z zobowiązań na /o-nas,
    - wiersza, w którym rynek robi to samo co my (np. bezpłatne założenie JDG
      przy podpisaniu umowy), nie pokazujemy jako przewagi.

   Widełki, które wracają w kilku miejscach, trzymamy w `marketExtras`, żeby
   opis wiersza i podsumowanie pod tabelą nie mogły się rozjechać.
   ────────────────────────────────────────────────────────────────────────── */

/** Miesiąc, w którym ostatnio sprawdzaliśmy cenniki z kolumny „typowe biuro”. */
export const comparisonChecked = 'sierpień 2026';


/**
 * Dopłaty, które w typowym biurze dotyczą praktycznie każdej jednoosobowej
 * działalności - trzy miesięczne i jedna roczna. Kwoty netto.
 */
const marketExtras = {
  /** Obsługa KSeF: od opłaty za platformę po stałą dopłatę miesięczną. */
  ksef: [20, 130],
  /** OCR dokumentów i portal klienta, zwykle jako opłata za dostęp do platformy. */
  ocrPortal: [20, 50],
  /** Deklaracje ZUS właściciela (DRA) rozliczane osobno od pakietu. */
  zusOwner: [30, 50],
  /** Roczne zeznanie PIT albo CIT z działalności. */
  annualReturn: [115, 600],
} as const;

const span = ([min, max]: readonly [number, number]) => `${num(min)} - ${num(max)}`;

export type ComparisonRow = {
  feature: string;
  taxun: string;
  typical: string;
  /** Pozycja, za którą my też pobieramy opłatę - tyle że niższą. Bez „ptaszka”. */
  paid?: boolean;
};

export const comparison: ComparisonRow[] = [
  {
    feature: 'Cennik z kwotami dostępny bez kontaktu',
    taxun: 'pełne tabele na stronie',
    typical: 'zwykle wycena po rozmowie',
  },
  {
    feature: 'KSeF - wysyłka i odbiór e-faktur',
    taxun: 'w cenie',
    typical: `+${span(marketExtras.ksef)} zł / mies.`,
  },
  {
    feature: 'OCR dokumentów i portal klienta 24/7',
    taxun: 'w cenie',
    typical: `+${span(marketExtras.ocrPortal)} zł / mies.`,
  },
  {
    feature: 'ZUS właściciela JDG',
    taxun: 'w cenie',
    typical: `+${span(marketExtras.zusOwner)} zł / mies.`,
  },
  {
    // Import usług zawężamy do czynnego podatnika VAT, bo u zwolnionego
    // uruchamia on moduł VAT-UE - bez tego wiersz obiecywałby w cenie coś,
    // za co obok pobieramy dopłatę.
    feature: 'VAT-UE: WNT, WDT, import usług u czynnego podatnika VAT',
    taxun: 'w cenie',
    typical: '+7 - 25 zł od transakcji',
  },
  {
    feature: 'Roczne zeznanie PIT / CIT z działalności',
    taxun: 'w cenie',
    typical: `+${span(marketExtras.annualReturn)} zł / rok`,
  },
  {
    feature: 'Sprawozdanie finansowe spółki',
    taxun: 'w cenie pakietu ksiąg',
    typical: '+800 - 2 800 zł / rok',
  },
  {
    feature: 'Dokumenty dostarczone po terminie',
    taxun: `${surchargeSpan} abonamentu`,
    typical: '+49 - 185 zł za miesiąc',
    paid: true,
  },
  {
    feature: 'Udział w kontroli US / ZUS',
    taxun: `${hourlyRate} zł / godz.`,
    typical: '180 - 400 zł / godz.',
    paid: true,
  },
  {
    feature: 'Wydanie ksiąg po zakończeniu współpracy',
    taxun: '0 zł, w ciągu 7 dni roboczych',
    typical: 'bywa 500 - 2 000 zł',
  },
  {
    feature: 'Cennik gwarantowany przez 12 miesięcy',
    taxun: 'w umowie',
    typical: 'cennik zmieniany w trakcie roku',
  },
];

/**
 * Ile rocznie kosztują dopłaty z `marketExtras` - czyli te, które w typowym
 * biurze dotyczą niemal każdej jednoosobowej działalności, a u nas mieszczą się
 * w abonamencie. Liczymy tylko cztery pozycje występujące powszechnie; VAT-UE,
 * kontrola czy sprawozdanie finansowe pojawiają się rzadziej, więc do sumy nie
 * wchodzą, żeby nie zawyżać różnicy.
 */
const yearly = ([min, max]: readonly [number, number]) => [min * 12, max * 12] as const;
const sum = (i: 0 | 1) =>
  yearly(marketExtras.ksef)[i] + yearly(marketExtras.ocrPortal)[i] + yearly(marketExtras.zusOwner)[i] +
  marketExtras.annualReturn[i];

export const hiddenFeesPerYear = { min: sum(0), max: sum(1) };

/* ── Wartości pochodne ───────────────────────────────────────────────────────
   Nagłówki, opisy SEO i dane strukturalne powtarzają te same kwoty co tabele.
   Zamiast wpisywać je ponownie, wyliczamy je z powyższych danych - dzięki temu
   jedna zmiana ceny wystarczy dla całego serwisu.
   ────────────────────────────────────────────────────────────────────────── */

/** Najniższa stawka danej formy księgowości, np. startsFrom('kpir') -> 249. */
export const startsFrom = (id: PricingTable['id']): number =>
  tables.find((t) => t.id === id)?.startsFrom ?? 0;

/** Stawki z tabeli podane kwotowo - progi "powyżej" mają wycenę indywidualną. */
const numericPrices = (t: PricingTable): number[] =>
  t.buckets
    .flatMap((b) => [b.noVat, b.withVat, b.price])
    .filter((v): v is number => typeof v === 'number');

/** Najwyższa stawka danej formy księgowości, np. endsAt('kpir') -> 809. */
export const endsAt = (id: PricingTable['id']): number => {
  const table = tables.find((t) => t.id === id);
  return table ? Math.max(...numericPrices(table)) : 0;
};

const allBucketPrices = tables.flatMap(numericPrices);

/** Najtańszy i najdroższy abonament w cenniku (dane strukturalne, opisy). */
export const priceMin = Math.min(...allBucketPrices);
export const priceMax = Math.max(...allBucketPrices);

/** Najniższa stawka za obsługę jednej osoby (zlecenie lub dzieło bez ZUS). */
export const hrLowest = Math.min(...hrPricing.map((h) => h.price));
