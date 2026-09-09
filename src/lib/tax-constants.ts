/**
 * Centralne stałe podatkowo-składkowe (aktualnie: rok 2026).
 *
 * To jedyne miejsce z wartościami, które zmieniają się co roku. Aby zaktualizować
 * kalkulatory na kolejny rok, wystarczy zmienić wartości w tym pliku - nazwy stałych
 * i ścieżki importów pozostają bez zmian.
 *
 * Źródła (stan na 2026 r.):
 *  - minimalne wynagrodzenie: 4806 zł (Rada Ministrów),
 *  - prognozowane przeciętne wynagrodzenie: 9420 zł (podstawa „dużego ZUS”),
 *  - przeciętne wynagrodzenie w sektorze przedsiębiorstw IV kw. 2025: 9228,64 zł
 *    (podstawa składki zdrowotnej na ryczałcie),
 *  - składki ZUS, składka zdrowotna i progi ryczałtu - komunikaty ZUS,
 *  - diety, kilometrówka, odsetki, limity aut i amortyzacji - rozporządzenia i ustawy.
 *
 * Wartości mają charakter informacyjny - pełną kalkulację robimy w konsultacji.
 */

import { pct, pctOf, round2 } from './format';

// --- Rok i kalendarz ---
export const TAX_YEAR = 2026;
export const DAYS_IN_YEAR = 365;
// Data aktualności danych pokazywana pod kalkulatorami
export const DATA_AKTUALIZACJI = `styczeń ${TAX_YEAR}`;
// Odsetki podatkowe zmieniają się w ślad za stopami NBP, stąd osobna data
export const DATA_AKTUALIZACJI_ODSETKI = `marzec ${TAX_YEAR}`;

// --- Wynagrodzenia bazowe ---
export const MIN_WAGE = 4806; // minimalne wynagrodzenie brutto
// Minimalne wynagrodzenie z roku poprzedniego - potrzebne do podstawy składki
// zdrowotnej za styczeń. Jeśli nie znamy jeszcze tej wartości, wystarczy ustawić
// null - wtedy w obliczeniach użyjemy stawki z bieżącego roku.
export const MIN_WAGE_PREV: number | null = 4666; // 2025 r.
export const MIN_WAGE_PREV_EFFECTIVE = MIN_WAGE_PREV ?? MIN_WAGE;
export const AVG_WAGE_FORECAST = 9420; // prognozowane przeciętne wynagrodzenie
export const AVG_WAGE_Q4 = 9228.64; // przeciętne wynagr. w sektorze przedsiębiorstw IV kw. roku poprzedniego

// --- Stawki składek społecznych przedsiębiorcy (od podstawy wymiaru) ---
export const RATE_EMERYTALNA = 0.1952;
export const RATE_RENTOWA = 0.08;
export const RATE_CHOROBOWA = 0.0245;
export const RATE_WYPADKOWA = 0.0167; // stawka domyślna (do 9 ubezpieczonych)
export const RATE_FP = 0.0245; // Fundusz Pracy + FGŚP
// Suma składek społecznych przedsiębiorcy z chorobową (bez FP, bez zdrowotnej)
export const SOCIAL_RATE = RATE_EMERYTALNA + RATE_RENTOWA + RATE_CHOROBOWA + RATE_WYPADKOWA; // 0,3164

// --- Podstawy i kwoty składek ZUS przedsiębiorcy (miesięcznie, bez zdrowotnej) ---
export const ZUS_FULL_BASE = 5652; // 60% prognozowanego przeciętnego wynagrodzenia
export const ZUS_PREF_BASE = 1441.8; // 30% minimalnego wynagrodzenia
export const ZUS_FULL_SOCIAL = round2(ZUS_FULL_BASE * SOCIAL_RATE); // ~1788,29 (z chorobową, bez FP)
export const ZUS_FULL_SOCIAL_FP = round2(ZUS_FULL_BASE * (SOCIAL_RATE + RATE_FP)); // ~1926,76 (z FP)
export const ZUS_PREF_SOCIAL = round2(ZUS_PREF_BASE * SOCIAL_RATE); // ~456,18 (bez FP)
export const MALY_ZUS_PLUS_EST = 900; // Mały ZUS Plus - zależny od dochodu (szacunek)
export const ZUS_PREF_MONTHS = 24; // ile miesięcy trwa ZUS preferencyjny
export const ULGA_NA_START_MONTHS = 6; // ulga na start - pierwsze miesiące bez składek społecznych

// --- Składka zdrowotna ---
export const HEALTH_RATE = 0.09; // 9% - skala, pracownik, zleceniobiorca
export const HEALTH_RATE_SKALA = HEALTH_RATE; // alias dla skali podatkowej
export const HEALTH_RATE_LINIOWY = 0.049; // liniowy - 4,9% dochodu
export const HEALTH_MIN_MONTH = round2(MIN_WAGE * HEALTH_RATE); // 432,54 - minimalna miesięczna (skala/liniowy)
// Styczeń jest wyjątkiem: podstawę minimalnej składki liczy się od 75% minimalnego
// wynagrodzenia z roku poprzedniego, a pełna kwota obowiązuje dopiero od lutego.
export const HEALTH_MIN_JANUARY_RATIO = 0.75;
export const HEALTH_MIN_BASE_JANUARY = round2(MIN_WAGE_PREV_EFFECTIVE * HEALTH_MIN_JANUARY_RATIO); // 3 499,50
export const HEALTH_MIN_MONTH_JANUARY = round2(HEALTH_MIN_BASE_JANUARY * HEALTH_RATE); // 314,96
// Minimalna składka zdrowotna za pełny rok (styczeń po niższej podstawie + 11 miesięcy)
export const HEALTH_MIN_YEAR = round2(HEALTH_MIN_MONTH_JANUARY + HEALTH_MIN_MONTH * 11);
/**
 * Minimalna składka zdrowotna za wskazaną liczbę miesięcy działalności.
 * Przy pełnym roku uwzględniamy niższą podstawę styczniową; przy krótszym okresie
 * zakładamy miesiące od lutego, bo nie wiemy, które to konkretnie miesiące.
 */
export const healthMinForMonths = (months: number) =>
  months >= 12 ? HEALTH_MIN_YEAR : round2(HEALTH_MIN_MONTH * months);
export const HEALTH_RYCZALT = {
  tier1: 498.35, // przychód do 60 000 zł (60% przeciętnego)
  tier2: 830.58, // przychód 60 000  -  300 000 zł (100% przeciętnego)
  tier3: 1495.04, // przychód powyżej 300 000 zł (180% przeciętnego)
};
// Progi przychodu (roczne) decydujące o stawce zdrowotnej ryczałtu
export const RYCZALT_TIER_LIMITS = { tier1: 60000, tier2: 300000 };
// Mnożniki przeciętnego wynagrodzenia dla podstawy zdrowotnej ryczałtu
export const RYCZALT_HEALTH_MULTIPLIERS = { tier1: 0.6, tier2: 1.0, tier3: 1.8 };
// Limit rocznego odliczenia składki zdrowotnej na podatku liniowym
// (obwieszczenie Ministra Finansów z 12 grudnia 2025 r.)
export const HEALTH_LINIOWY_DEDUCT_LIMIT = 14100;
// Karta podatkowa: składka liczona od minimalnego wynagrodzenia (9%)
export const HEALTH_KARTA_MONTH = round2(MIN_WAGE * HEALTH_RATE); // 432,54
// Karta podatkowa: o tyle procent zapłaconej składki obniża się podatek (art. 31 ustawy o ryczałcie)
export const KARTA_HEALTH_DEDUCT_RATE = 0.19;
// Ryczałt: jaką część zapłaconej składki zdrowotnej odlicza się od przychodu
export const RYCZALT_HEALTH_DEDUCT_RATE = 0.5;

// --- PIT (skala i liniowy) ---
export const PIT_FREE_AMOUNT = 30000; // kwota wolna (skala)
export const PIT_THRESHOLD = 120000; // próg podatkowy (skala)
export const PIT_RATE_1 = 0.12;
export const PIT_RATE_2 = 0.32;
export const PIT_RATE_LINIOWY = 0.19;
export const IP_BOX_RATE = 0.05; // preferencyjna stawka PIT dla kwalifikowanych dochodów z IP
export const PIT_ZALICZKA_RATE = PIT_RATE_1; // stawka zaliczki na PIT (umowy, niski próg)
// Roczna kwota zmniejszająca podatek (skala): 30 000 zł × 12%
export const PIT_KWOTA_ZMNIEJSZAJACA = round2(PIT_FREE_AMOUNT * PIT_RATE_1); // 3600
// Miesięczna kwota zmniejszająca zaliczkę PIT (PIT-2): kwota wolna × 12% / 12
export const PIT_KWOTA_WOLNA_MIESIECZNA = round2(PIT_FREE_AMOUNT * PIT_RATE_1 / 12); // 300
// Limit ulgi dla młodych (do 26 r.ż.) - roczny przychód zwolniony z PIT
export const ULGA_MLODYCH_LIMIT = 85528;
export const ULGA_MLODYCH_AGE = 26; // granica wieku ulgi dla młodych

// Opcje stawek podatku dochodowego (do selecta „forma opodatkowania”)
// Kolejność ma znaczenie: oba progi skali stoją obok siebie, żeby nikt ich nie pomylił.
export const INCOME_TAX_OPTIONS = [
  { value: PIT_RATE_1, label: 'Skala 12% (I próg)' },
  { value: PIT_RATE_2, label: 'Skala 32% (II próg)' },
  { value: PIT_RATE_LINIOWY, label: 'Podatek liniowy 19%' },
  { value: 0, label: 'Ryczałt (koszty nie obniżają podatku)' },
];

/**
 * Stawki ryczałtu od przychodów ewidencjonowanych.
 *
 * O stawce decyduje PKWiU konkretnej usługi, a nie kod PKD wpisany w CEIDG ani
 * nazwa stanowiska w kontrakcie. Nazwane stałe poniżej opisują poszczególne
 * pozycje ustawy, żeby strony i kalkulatory nie powtarzały tych samych liczb.
 */
/** Usługi związane z oprogramowaniem oraz doradztwo w zakresie oprogramowania i sprzętu. */
export const RYCZALT_IT = 0.12;
/** Pozostała działalność usługowa, niewymieniona w żadnej innej pozycji ustawy. */
export const RYCZALT_USLUGI = 0.085;
/** Działalność usługowa w zakresie handlu, czyli odsprzedaż zakupionych towarów. */
export const RYCZALT_HANDEL = 0.03;
/**
 * Pośrednictwo w sprzedaży detalicznej, czyli sprzedaż w cudzym imieniu i na
 * cudzy rachunek za prowizją. Stawka jest ta sama co dla pozostałych usług,
 * ale podstawa w ustawie jest odrębna - w dropshippingu to właśnie ta pozycja
 * decyduje o tym, czy przychodem jest cała wpłata klienta, czy sama prowizja.
 */
export const RYCZALT_POSREDNICTWO_DETAL = 0.085;
/** Pośrednictwo w sprzedaży hurtowej - odrębna pozycja ustawy, wyższa stawka. */
export const RYCZALT_POSREDNICTWO_HURT = 0.15;
/** Stawka ryczałtu dla usług w zakresie opieki zdrowotnej (PKWiU dział 86). */
export const RYCZALT_MEDYCZNY = 0.14;
/** Specjalistyczne projektowanie (PKWiU 74.1) oraz usługi architektoniczne i inżynierskie. */
export const RYCZALT_PROJEKTOWANIE = 0.14;
/** Doradztwo związane z zarządzaniem, usługi reklamowe i badanie rynku. */
export const RYCZALT_DORADZTWO = 0.15;
/**
 * Usługi w zakresie edukacji (PKWiU dział 85) - korepetycje, szkolenia, kursy
 * zawodowe i pozaszkolne formy edukacji.
 *
 * Ustawa wymienia edukację w osobnej pozycji, obok "pozostałych usług", choć
 * stawka jest ta sama. Trzymamy dla niej odrębną stałą, bo podstawa prawna
 * jest inna, a przy ewentualnej zmianie przepisów rozjechałaby się tylko jedna
 * z tych dwóch pozycji.
 */
export const RYCZALT_EDUKACJA = 0.085;
/**
 * Usługi związane ze sportem, rozrywką i rekreacją (PKWiU dział 93) - m.in.
 * udostępnianie obiektu i sprzętu, karnety wstępu, organizacja zajęć bez
 * komponentu szkoleniowego.
 *
 * To druga stawka występująca w branży sportowej, obok RYCZALT_EDUKACJA.
 * Różnica jest niemal dwukrotna, a rozstrzyga o niej klasyfikacja PKWiU
 * faktycznie wykonywanej czynności, nie kod PKD ani nazwa zawodu, więc obie
 * stawki trzymamy w osobnych stałych z odrębnymi podstawami w ustawie.
 */
export const RYCZALT_SPORT = 0.15;
/**
 * Przewóz ładunków taborem samochodowym o ładowności powyżej 2 ton (art. 12
 * ust. 1 pkt 6 lit. a ustawy o ryczałcie).
 *
 * To jedyna pozycja transportowa z własną stawką. Przewóz osób taksówką oraz
 * przewóz ładunków pojazdem o mniejszej ładowności zostają przy
 * RYCZALT_USLUGI, bo ustawa nie przewidziała dla nich odrębnej pozycji - stąd
 * dwie różne stałe w jednej branży. O przypisaniu decyduje ładowność pojazdu,
 * a nie jego dopuszczalna masa całkowita.
 */
export const RYCZALT_TRANSPORT = 0.055;
/** Granica ładowności w tonach, od której wchodzi stawka RYCZALT_TRANSPORT. */
export const TRANSPORT_LADOWNOSC_PROG = 2;
/** Wolne zawody w rozumieniu ustawy o ryczałcie. */
export const RYCZALT_WOLNY_ZAWOD = 0.17;
/**
 * Rok, od którego nauczyciele udzielający lekcji na godziny nie są już
 * wymienieni w ustawowej definicji wolnego zawodu. Do tego czasu obowiązywała
 * ich stawka RYCZALT_WOLNY_ZAWOD - stara informacja nadal krąży w internecie,
 * więc podstrony branżowe muszą podawać tę datę wprost.
 */
export const NAUCZYCIEL_POZA_WOLNYM_ZAWODEM_OD = 2022;
/**
 * Najem, podnajem i dzierżawa oraz usługi zakwaterowania (art. 12 ust. 1 pkt 4
 * lit. a oraz pkt 2 lit. e ustawy o ryczałcie).
 *
 * Wartość jest ta sama co RYCZALT_USLUGI, ale podstawa prawna inna, a przede
 * wszystkim inna jest konstrukcja: po przekroczeniu progu rocznego nadwyżkę
 * opodatkowuje stawka podwyższona, czego przy pozostałych usługach nie ma.
 * Dlatego najem ma własne stałe - przy zmianie jednej z tych pozycji druga
 * zostałaby nietknięta.
 *
 * Ta sama para stawek obejmuje najem prywatny i usługi zakwaterowania
 * świadczone w działalności gospodarczej, więc apartament na doby i pensjonat
 * rozliczają się tak samo jak zwykły wynajem mieszkania.
 */
export const RYCZALT_NAJEM = 0.085;
/** Stawka od nadwyżki przychodu ponad RYCZALT_NAJEM_PROG. */
export const RYCZALT_NAJEM_WYZSZY = 0.125;
/**
 * Roczny próg przychodu, od którego wchodzi stawka podwyższona. Dotyczy
 * podatnika, a nie pojedynczego lokalu - przychody z wszystkich wynajmowanych
 * nieruchomości sumują się.
 */
export const RYCZALT_NAJEM_PROG = 100000;
/**
 * Próg dla małżonków, którzy złożyli oświadczenie o opodatkowaniu całości
 * przychodu przez jedno z nich (art. 12 ust. 6 i 7 ustawy o ryczałcie).
 * Bez oświadczenia każde z małżonków rozlicza połowę przychodu i korzysta
 * z własnego progu RYCZALT_NAJEM_PROG.
 */
export const RYCZALT_NAJEM_PROG_MALZONKOWIE = 200000;
/**
 * Rok, od którego odpisy amortyzacyjne od budynków i lokali mieszkalnych nie
 * stanowią kosztu uzyskania przychodu. To zmiana, która wywróciła kalkulacje
 * opłacalności rozliczenia kosztowego przy mieszkaniach, więc podstrony muszą
 * podawać tę datę wprost - starsze poradniki nadal liczą amortyzację.
 */
export const AMORTYZACJA_MIESZKAN_KONIEC = 2023;
/**
 * Maksymalna liczba wynajmowanych pokoi gościnnych, przy której dochody
 * z agroturystyki są zwolnione z podatku dochodowego (art. 21 ust. 1 pkt 43
 * ustawy o PIT). Pozostałe warunki zwolnienia trzeba spełnić łącznie.
 */
export const AGROTURYSTYKA_POKOJE_LIMIT = 5;

export const RYCZALT_RATES = [
  { value: RYCZALT_TRANSPORT, label: '5,5% (przewóz ładunków taborem o ładowności powyżej 2 ton, roboty budowlane)' },
  { value: RYCZALT_USLUGI, label: '8,5% (pozostałe usługi, niewymienione w innych pozycjach)' },
  { value: RYCZALT_IT, label: '12% (usługi związane z oprogramowaniem, sieci i systemy IT)' },
  { value: RYCZALT_MEDYCZNY, label: '14% (opieka zdrowotna, specjalistyczne projektowanie, usługi inżynierskie)' },
  { value: RYCZALT_DORADZTWO, label: '15% (doradztwo związane z zarządzaniem, reklama, badanie rynku)' },
  { value: RYCZALT_WOLNY_ZAWOD, label: '17% (wolne zawody)' },
];

/**
 * Limit przychodu za rok poprzedni, do którego można rozliczać się ryczałtem.
 * Ustawa określa go jako równowartość 2 000 000 euro, więc kwota w złotych
 * zmienia się co roku wraz z kursem NBP z 1 października roku poprzedniego.
 */
export const RYCZALT_LIMIT_EUR = 2000000;
export const RYCZALT_LIMIT = 8517200;

// --- Składki pracownika (umowa o pracę / zlecenie, od brutto) ---
export const EMP_EMERYTALNA = 0.0976;
export const EMP_RENTOWA = 0.015;
export const EMP_CHOROBOWA = 0.0245;
export const EMP_ZUS_RATE = EMP_EMERYTALNA + EMP_RENTOWA + EMP_CHOROBOWA; // 0,1371

// --- Składki pracodawcy / zleceniodawcy (od brutto, narzut) ---
export const EMPLOYER_EMERYTALNA = 0.0976;
export const EMPLOYER_RENTOWA = 0.065;
export const EMPLOYER_WYPADKOWA = 0.0167; // zależna od ryzyka
export const EMPLOYER_FP_FGSP = 0.0255; // Fundusz Pracy + FGŚP
export const EMPLOYER_ZUS_RATE = EMPLOYER_EMERYTALNA + EMPLOYER_RENTOWA + EMPLOYER_WYPADKOWA + EMPLOYER_FP_FGSP; // ~0,2048
// Narzut zleceniodawcy bez FP/FGŚP (zlecenie: emerytalna + rentowa + wypadkowa)
export const PAYER_ZLECENIE_RATE = EMPLOYER_EMERYTALNA + EMPLOYER_RENTOWA + EMPLOYER_WYPADKOWA;

// --- PPK (Pracownicze Plany Kapitałowe) ---
export const PPK_EMPLOYEE_BASIC = 0.02;
export const PPK_EMPLOYEE_MAX = 0.04;
export const PPK_EMPLOYER = 0.015;
export const PPK_EMPLOYER_MAX = 0.04;
export const PPK_WPLATA_POWITALNA = 250; // jednorazowa wpłata powitalna od państwa
export const PPK_DOPLATA_ROCZNA = 240; // coroczna dopłata od państwa

// --- Koszty uzyskania przychodu (umowy, etat) ---
export const KUP_STANDARD = 0.2; // 20%
export const KUP_TWORCZE = 0.5; // 50% (przeniesienie praw autorskich)
export const KUP_TWORCZE_LIMIT = 120000; // roczny limit kosztów 50%
export const KUP_PRACOWNIK_STANDARD = 250; // miesięczne KUP pracownika (umowa o pracę)
export const KUP_PRACOWNIK_DOJAZD = 300; // podwyższone KUP (dojazd)

// --- Umowa o dzieło ---
export const DZIELO_RYCZALT_THRESHOLD = 200; // do tej kwoty podatek zryczałtowany 12% bez KUP
export const DZIELO_RUD_DNI = 7; // termin zgłoszenia umowy do ZUS na formularzu RUD

// --- Minimalna stawka godzinowa (zlecenie) ---
export const MIN_STAWKA_GODZINOWA = 31.4;

// --- Zasiłki: podstawa i stawki ---
export const ZASILEK_ZUS_POMNIEJSZENIE = EMP_ZUS_RATE; // 13,71% - pomniejszenie podstawy o składki
export const ZASILEK_DZIELNIK = 30; // dzielnik podstawy dziennej
export const ZASILEK_MIESIECY_PODSTAWY = 12; // z ilu miesięcy liczy się przeciętne wynagrodzenie

// Zasiłek chorobowy
export const SICK_RATE_STANDARD = 0.8; // 80%
export const SICK_RATE_FULL = 1.0; // 100% (ciąża, wypadek, dawca)
export const SICK_RATE_HOSPITAL = 0.7; // 70% (wybrane przypadki pobytu w szpitalu)
// Okres zasiłkowy liczony w dniach kalendarzowych
export const SICK_PERIOD_DAYS = 182; // standardowy
export const SICK_PERIOD_DAYS_LONG = 270; // ciąża i gruźlica
// Dni płatne przez pracodawcę (wynagrodzenie chorobowe) w roku kalendarzowym
export const SICK_EMPLOYER_DAYS = 33;
export const SICK_EMPLOYER_DAYS_50PLUS = 14; // pracownicy po 50. roku życia
export const SICK_EMPLOYER_AGE = 50; // od tego wieku pracodawca płaci krócej
export const SICK_BREAK_DAYS = 60; // przerwa, po której okres zasiłkowy liczy się od nowa

// Zasiłek macierzyński / urlopy (w tygodniach, wg liczby dzieci z porodu)
export const MATERNITY_WEEKS: Record<string, number> = { '1': 20, '2': 31, '3': 33 };
// Przy czworgu i większej liczbie dzieci urlop macierzyński jest jeszcze dłuższy
export const MATERNITY_WEEKS_MAX = 37;
export const PARENTAL_WEEKS: Record<string, number> = { '1': 41, '2': 43, '3': 43 };
export const PARENTAL_RESERVED_WEEKS = 9; // część nieprzenoszalna (płatna 70%)
export const MATERNITY_RATE_AVG = 0.815; // wariant uśredniony (wniosek w 21 dni)
export const MATERNITY_RATE_FULL = 1.0; // urlop macierzyński bez łącznego wniosku
export const PARENTAL_RATE = 0.7; // urlop rodzicielski / część nieprzenoszalna
export const MATERNITY_WNIOSEK_DNI = 21; // termin wniosku o uśrednioną stawkę 81,5%

// --- Podróże służbowe (krajowe) ---
export const DIETA_KRAJOWA = 45; // pełna dieta za dobę
export const RYCZALT_NOCLEG = round2(DIETA_KRAJOWA * 1.5); // 67,50 - ryczałt za nocleg bez rachunku
export const RYCZALT_DOJAZD = round2(DIETA_KRAJOWA * 0.2); // 9,00 - ryczałt na dojazdy
// Potrącenia diety za zapewnione posiłki
export const MEAL_DEDUCTIONS = { sniadanie: 0.25, obiad: 0.5, kolacja: 0.25 };
// Dieta za niepełną dobę
export const DIETA_NIEPELNA = { do8h: 0.5, ponad8h: 1.0 };
export const DIETA_NIEPELNA_GODZINY = 8; // granica między połową a pełną dietą

// --- Odsetki podatkowe (w stosunku rocznym) ---
export const ODSETKI_STANDARD = 0.105; // 10,5%
export const ODSETKI_OBNIZONE = 0.0525; // 5,25%
export const ODSETKI_PODWYZSZONE = 0.1575; // 15,75%
export const ODSETKI_MIN_POBOR = 8.7; // odsetek poniżej tej kwoty nie wpłaca się
// Warunki stawki obniżonej: korekta w tym terminie i zapłata w tylu dniach od korekty
export const ODSETKI_OBNIZONE_KOREKTA_MIESIACE = 6;
export const ODSETKI_OBNIZONE_ZAPLATA_DNI = 7;
// Data, od której obowiązuje aktualna stawka (zmienia się wraz ze stopami NBP)
export const ODSETKI_STAWKA_OD = '5 marca 2026';
// Etykiety i opisy powstają ze stawek, więc selektor i tabela w opisie są zawsze zgodne
export const ODSETKI_OPTIONS = [
  { value: ODSETKI_STANDARD, name: 'Standardowa', hint: '', when: `domyślnie (od ${ODSETKI_STAWKA_OD})` },
  {
    value: ODSETKI_OBNIZONE,
    name: 'Obniżona',
    hint: 'korekta, czynny żal',
    when: `korekta deklaracji w ${ODSETKI_OBNIZONE_KOREKTA_MIESIACE} mies. + zapłata w ${ODSETKI_OBNIZONE_ZAPLATA_DNI} dni`,
  },
  { value: ODSETKI_PODWYZSZONE, name: 'Podwyższona', hint: 'VAT, cło', when: 'zaniżenie VAT/akcyzy wykryte przez urząd' },
].map((o) => ({ ...o, label: `${o.name} - ${pct(o.value)}${o.hint ? ` (${o.hint})` : ''}` }));

// --- VAT ---
export const VAT_RATE = 0.23; // podstawowa
/**
 * Stawka obniżona. Usługi związane z zakwaterowaniem (PKWiU dział 55, czyli
 * hotele, pensjonaty, domki i apartamenty na doby) oraz usługi fryzjerskie
 * korzystają z niej na podstawie załącznika nr 3 do ustawy o VAT, a część
 * usług kosmetycznych (PKWiU 96.02.13.0, ex 96.02.14.0 i 96.02.19.0) - na
 * podstawie rozporządzenia Ministra Finansów z 14 marca 2024 r. (Dz. U.
 * z 2024 r. poz. 387).
 */
export const VAT_RATE_OBNIZONA = 0.08;
/** Data wejścia w życie obniżki stawki dla części usług kosmetycznych. */
export const VAT_BEAUTY_OBNIZKA_OD = '1 kwietnia 2024 roku';
/**
 * Limit zwolnienia podmiotowego z VAT (art. 113 ustawy o VAT).
 * Dotyczy wyłącznie zwolnienia ze względu na wartość sprzedaży. Zwolnienie
 * przedmiotowe, np. dla usług opieki medycznej, nie jest limitowane obrotem.
 */
export const VAT_ZWOLNIENIE_LIMIT = 240000;
/**
 * Kategorie towarów, przy których sprzedaż na odległość (w praktyce: przez
 * internet) wyklucza zwolnienie ze względu na wartość sprzedaży - art. 113
 * ust. 13 pkt 1 lit. f ustawy o VAT, w brzmieniu obowiązującym od 1 września
 * 2019 r. Wyłączenie działa od pierwszej transakcji, niezależnie od obrotu,
 * więc lista jest twardym warunkiem, a nie wskazówką interpretacyjną.
 */
export const VAT_WYLACZENIA_NA_ODLEGLOSC = [
  { name: 'Preparaty kosmetyczne i toaletowe', pkwiu: 'PKWiU 20.42.1' },
  { name: 'Komputery, wyroby elektroniczne i optyczne', pkwiu: 'PKWiU 26' },
  { name: 'Urządzenia elektryczne, w tym sprzęt gospodarstwa domowego', pkwiu: 'PKWiU 27' },
  { name: 'Maszyny i urządzenia gdzie indziej niesklasyfikowane', pkwiu: 'PKWiU 28' },
];
/**
 * Sprzedaż części i akcesoriów do pojazdów silnikowych oraz motocykli również
 * wyklucza zwolnienie, ale niezależnie od kanału sprzedaży - także w sklepie
 * stacjonarnym. Dlatego stoi osobno, poza listą "na odległość".
 */
export const VAT_WYLACZENIE_CZESCI_POJAZDY = 'Części i akcesoria do pojazdów silnikowych oraz motocykli';

/**
 * Zryczałtowany VAT dla usług taksówek osobowych (art. 114 ustawy o VAT).
 *
 * Podatnik może wybrać opodatkowanie przewozów zryczałtowaną stawką zamiast
 * VAT_RATE_OBNIZONA, ale traci wtedy prawo do odliczenia podatku naliczonego
 * (ust. 2 wyłącza stosowanie art. 86), więc nie odliczy VAT ani od paliwa, ani
 * od samego pojazdu. Zamiast pliku JPK składa się skróconą deklarację VAT-12.
 *
 * Uwaga na dwie liczby: w podstawowym brzmieniu art. 114 ust. 1 widnieje 3%,
 * ale przepis przejściowy (art. 146ef ust. 1 pkt 4) podwyższa ją do 4% i to ta
 * stawka obowiązuje. Starsze artykuły podają nieaktualną wartość, dlatego
 * trzymamy obie - strona musi umieć wyjaśnić skąd bierze się rozbieżność.
 */
export const VAT_TAXI_RYCZALT = 0.04;
/** Stawka z podstawowego brzmienia przepisu - dziś podniesiona przepisem przejściowym. */
export const VAT_TAXI_RYCZALT_USTAWOWY = 0.03;
/** Minimalny okres stosowania ryczałtu VAT dla taksówek (art. 114 ust. 3). */
export const VAT_TAXI_OKRES_MIESIACE = 12;
/** Usługi wyłączone z ryczałtu wprost w treści art. 114 ust. 1. */
export const VAT_TAXI_RYCZALT_WYLACZENIA = [
  'wynajem samochodów osobowych z kierowcą',
  'usługi taksówek bagażowych',
];

export const VAT_MIXED_DEDUCT = 0.5; // odliczenie VAT przy użytku mieszanym (auta)
export const VAT_FULL_DEDUCT = 1; // pełne odliczenie (auto tylko firmowe, VAT-26)
export const VAT_RATES = [
  { value: 0.23, label: '23% (standardowa)' },
  { value: 0.08, label: '8% (m.in. usługi budowlane, gastronomia)' },
  { value: 0.05, label: '5% (m.in. żywność, książki)' },
  { value: 0, label: '0% / zwolnione' },
];

// --- Klasyfikacja PKD ---
/**
 * Nowa Polska Klasyfikacja Działalności obowiązuje przy rejestracji od tej daty,
 * a firmy zarejestrowane wcześniej mają czas na dostosowanie kodów do terminu
 * poniżej. Po jego upływie kody zostaną przepisane automatycznie według kluczy
 * przejść, więc daty trzymamy tutaj, żeby po 2026 r. poprawić je w jednym miejscu.
 */
export const PKD_NOWA_OD = '1 stycznia 2025 roku';
export const PKD_AKTUALIZACJA_DO = 'końca 2026 roku';

// --- Samochody osobowe: limity kosztów i emisja CO₂ ---
export const CAR_LIMIT = {
  spalinowy: 100000, // emisja CO₂ ≥ 50 g/km
  niskoemisyjny: 150000, // PHEV, emisja < 50 g/km
  elektryczny: 225000, // elektryczne i wodorowe
};
export const CO2_THRESHOLD = 50; // g/km - granica limitu 100 vs 150 tys. zł
// Limit sprzed obniżki - zachowany dla aut wprowadzonych do ewidencji przed 2026 r.
export const CAR_LIMIT_LEGACY = 150000;
// Typowa emisja aut benzynowych i wysokoprężnych - używane w opisach
export const CO2_TYPICAL = { min: 120, max: 200 };
// Limit kosztów eksploatacji samochodu osobowego przy użytku mieszanym (art. 23 ust. 1 pkt 46a PIT)
export const CAR_EKSPLOATACJA_LIMIT = 0.75;
/**
 * Dopuszczalna masa całkowita (w tonach), powyżej której pojazd przestaje być
 * samochodem osobowym w rozumieniu art. 5a pkt 19a ustawy o PIT. Powyżej tej
 * granicy nie obowiązują ani limity CAR_LIMIT, ani CAR_EKSPLOATACJA_LIMIT,
 * a wydatki eksploatacyjne rozlicza się w całości.
 */
export const DMC_SAMOCHOD_OSOBOWY = 3.5;
// Warianty rozliczenia VAT przy aucie w firmie
export const CAR_VAT_OPTIONS = [
  { value: 'mieszany', deduct: VAT_MIXED_DEDUCT, label: 'Czynny VAT-owiec, użytek mieszany - odliczam 50% VAT' },
  { value: 'firmowy', deduct: 1, label: 'Czynny VAT-owiec, tylko firmowo (VAT-26) - odliczam 100% VAT' },
  { value: 'zwolniony', deduct: 0, label: 'Nie jestem VAT-owcem (zwolnienie) - nie odliczam VAT' },
] as const;

// --- Działalność lecznicza ---
/**
 * Opłata za wpis praktyki zawodowej do rejestru podmiotów wykonujących
 * działalność leczniczą (art. 105 ust. 1 ustawy o działalności leczniczej).
 * Liczona jako procent przeciętnego miesięcznego wynagrodzenia w sektorze
 * przedsiębiorstw bez wypłat nagród z zysku za rok ubiegły, więc kwota zmienia
 * się co roku wraz z obwieszczeniem GUS. Trzymamy tu samą stawkę, żeby opis na
 * stronie nie wymagał corocznej korekty.
 */
export const RPWDL_WPIS_STAWKA = 0.02;
/** Ta sama opłata dla podmiotu leczniczego (spółki, przychodni). */
export const RPWDL_WPIS_STAWKA_PODMIOT = 0.1;

/**
 * Miesięczna składka członkowska na rzecz Krajowej Izby Fizjoterapeutów.
 * Kwota została "zamrożona" uchwałą KRF, więc nie idzie już za minimalnym
 * wynagrodzeniem - stąd zwykła liczba, a nie wyliczenie.
 */
export const KIF_SKLADKA_MIESIECZNA = 45;

/**
 * Minimalne sumy gwarancyjne obowiązkowego OC praktyki fizjoterapeutycznej,
 * w euro (rozporządzenie Ministra Finansów z 29 kwietnia 2019 r. w sprawie
 * obowiązkowego ubezpieczenia OC podmiotu wykonującego działalność leczniczą).
 */
export const OC_FIZJOTERAPIA_EUR = { zdarzenie: 30000, wszystkie: 150000 };

/**
 * Ustawa z 23 stycznia 2026 r. o zawodzie psychologa oraz samorządzie zawodowym
 * psychologów. Co do zasady wchodzi w życie po 2 latach i 3 miesiącach od
 * ogłoszenia, więc do tego czasu psycholog prowadzi zwykłą działalność
 * gospodarczą - bez wpisu do rejestru praktyk i bez składki samorządowej.
 */
export const USTAWA_PSYCHOLOG_DZU = 'Dz.U. 2026 poz. 187';
export const USTAWA_PSYCHOLOG_WEJSCIE = '19 maja 2028 roku';

// --- Państwowa Inspekcja Pracy ---
/**
 * Nowelizacja ustawy o Państwowej Inspekcji Pracy z 11 marca 2026 r.
 * Od daty poniżej okręgowy inspektor pracy może ustalić istnienie stosunku
 * pracy decyzją administracyjną, a nie dopiero pozwem do sądu. Ustawa daje
 * też okres, w którym dobrowolne zawarcie umowy o pracę zwalnia z
 * odpowiedzialności za wykroczenie z art. 281 § 1 pkt 1 Kodeksu pracy.
 */
export const PIP_DECYZJE_OD = '8 lipca 2026 roku';
export const PIP_KARENCJA_MIESIACE = 12;
export const PIP_KARENCJA_DO = '8 lipca 2027 roku';
/** Interpretacja indywidualna Głównego Inspektora Pracy - opłata i termin. */
export const PIP_INTERPRETACJA_OPLATA = 40;
export const PIP_INTERPRETACJA_DNI = 30;

// --- Opłaty skarbowe ---
/** Opłata skarbowa od złożenia dokumentu pełnomocnictwa. */
export const OPLATA_SKARBOWA_PELNOMOCNICTWO = 17;
/**
 * Opłata od wniosku o wydanie interpretacji indywidualnej (ORD-IN).
 * Pobierana od każdego stanu faktycznego i zdarzenia przyszłego opisanego we
 * wniosku, więc jeden wniosek obejmujący kilka pytań kosztuje jej wielokrotność.
 */
export const OPLATA_WNIOSEK_INTERPRETACJA = 40;
/**
 * Opłata od wniosku o wydanie wiążącej informacji stawkowej (WIS).
 * Pobierana od każdego towaru, usługi albo świadczenia kompleksowego, a jeden
 * wniosek może obejmować tylko jedną taką pozycję, więc kilka spornych usług
 * oznacza kilka wniosków i wielokrotność opłaty.
 */
export const OPLATA_WNIOSEK_WIS = 40;
/** Ustawowy termin wydania WIS przez Dyrektora Krajowej Informacji Skarbowej. */
export const WIS_TERMIN_MIESIACE = 3;

// --- Kasa fiskalna ---
export const KASA_LIMIT_ROCZNY = 20000; // limit zwolnienia z kasy fiskalnej
export const KASA_TERMIN_MIESIACE = 2; // ile miesięcy na instalację kasy po przekroczeniu limitu
/**
 * Ulga na zakup kasy rejestrującej online (art. 111 ust. 4 ustawy o VAT):
 * odliczenie 90% ceny netto urządzenia, nie więcej niż 700 zł na jedną kasę.
 * Warunkiem jest fiskalizacja i zgłoszenie kasy w terminach z rozporządzenia.
 */
export const KASA_ULGA_RATE = 0.9;
export const KASA_ULGA_MAX = 700;
/**
 * Ulga przysługuje na każdą kasę kupioną przy rozpoczęciu ewidencjonowania,
 * pod warunkiem uruchomienia wszystkich w tym terminie od pierwszej z nich.
 */
export const KASA_ULGA_MIESIACE = 6;
/**
 * Działalności formalnie mieszczące się w edukacji, które mimo to wyłączono ze
 * zwolnienia z obowiązku ewidencjonowania na kasie rejestrującej. Lista bierze
 * się z rozporządzenia w sprawie zwolnień z kas, a nie z klasyfikacji PKWiU,
 * dlatego trzymamy ją tutaj, a nie w treści strony.
 */
export const KASA_EDUKACJA_WYJATKI = [
  'Pozaszkolne formy edukacji sportowej oraz zajęcia sportowe i rekreacyjne',
  'Usługi świadczone przez szkoły tańca i instruktorów tańca',
  'Usługi świadczone przez szkoły nauki jazdy',
];

/**
 * Warunki zwolnienia z kasy rejestrującej przy dostawie towarów w systemie
 * wysyłkowym (rozporządzenie Ministra Finansów z 17 grudnia 2024 r. w sprawie
 * zwolnień z obowiązku prowadzenia ewidencji sprzedaży przy zastosowaniu kas
 * rejestrujących). Muszą być spełnione łącznie - jedna transakcja poza nimi
 * odbiera zwolnienie.
 */
export const KASA_WYSYLKA_WARUNKI = [
  'Towar trafia do kupującego przesyłką pocztową lub kurierem, bez odbioru osobistego',
  'Całość zapłaty wpływa na rachunek bankowy albo rachunek w SKOK',
  'Z ewidencji i dowodów zapłaty jednoznacznie wynika, kogo i jakiej transakcji dotyczy wpłata',
];
/**
 * Towary, przy których kasa rejestrująca jest wymagana niezależnie od formy
 * dostawy i płatności (§ 4 tego samego rozporządzenia). Lista częściowo
 * pokrywa się z wyłączeniami ze zwolnienia z VAT, ale nie jest z nią tożsama,
 * dlatego stoi osobno.
 */
export const KASA_ECOMMERCE_WYJATKI = [
  'Perfumy i wody toaletowe',
  'Wyroby alkoholowe i tytoniowe',
  'Sprzęt radiowy, telewizyjny i telekomunikacyjny',
  'Komputery, wyroby elektroniczne i optyczne',
  'Sprzęt fotograficzny',
  'Części i akcesoria do pojazdów silnikowych',
];
/** Rozporządzenie o zwolnieniach z kas obowiązuje w tym brzmieniu do tego momentu. */
export const KASA_ZWOLNIENIA_DO = 'końca 2027 roku';
/**
 * Warunki zwolnienia z kasy rejestrującej przy wynajmie i zarządzaniu
 * nieruchomościami własnymi lub dzierżawionymi (poz. 29 załącznika do
 * rozporządzenia z 17 grudnia 2024 r.). Muszą być spełnione łącznie, a
 * przyjęcie zapłaty gotówką odbiera zwolnienie od tej transakcji.
 *
 * Przy usługach przepis wymaga powiązania wpłaty z konkretną czynnością i nie
 * żąda danych nabywcy - te pojawiają się dopiero przy dostawie towarów
 * w systemie wysyłkowym (poz. 41), stąd różnica wobec KASA_WYSYLKA_WARUNKI.
 */
export const KASA_NAJEM_WARUNKI = [
  'Usługa jest w całości udokumentowana fakturą albo cała zapłata wpływa na rachunek bankowy',
  'Z ewidencji i dowodów zapłaty jednoznacznie wynika, jakiej konkretnie umowy dotyczy wpłata',
  'Umowa dotyczy najmu, a nie krótkotrwałego udostępniania miejsca postoju z rotacją użytkowników',
];

// --- Podatek od nieruchomości ---
/**
 * Górne granice stawek rocznych za metr kwadratowy powierzchni użytkowej.
 * Konkretną stawkę uchwala rada gminy i nie może przekroczyć tych kwot, więc
 * podajemy je jako maksima, a nie jako obowiązującą u klienta wysokość.
 *
 * Różnica między lokalem mieszkalnym a zajętym na działalność jest w tej
 * daninie kilkudziesięciokrotna, dlatego przy przejściu na najem
 * krótkoterminowy trzeba ją policzyć razem z podatkiem dochodowym.
 */
export const PODATEK_NIERUCHOMOSCI_MAX = {
  mieszkalny: 1.25,
  pozostale: 12,
  dzialalnosc: 35.53,
};
/**
 * Uchwała NSA rozstrzygająca, że lokal mieszkalny wynajęty na cele mieszkaniowe
 * podlega niższej stawce także wtedy, gdy wynajmującym jest przedsiębiorca.
 */
export const PODATEK_NIERUCHOMOSCI_UCHWALA = 'uchwała NSA z 21 października 2024 r., sygn. akt III FPS 2/24';
/**
 * Data, od której obowiązuje unijne rozporządzenie 2024/1028 o gromadzeniu
 * i wymianie danych o najmie krótkoterminowym. Krajowa ustawa wprowadzająca
 * centralny wykaz obiektów noclegowych nie została jeszcze uchwalona, więc
 * strony mają o tym pisać jako o procesie w toku, a nie o gotowym obowiązku.
 */
export const NAJEM_KROTKOTERMINOWY_UE_OD = '20 maja 2026 roku';

// --- Raportowanie przez platformy sprzedażowe (DAC7) ---
/**
 * Dyrektywa DAC7 wdrożona ustawą z 23 maja 2024 r. Operatorzy platform
 * przekazują Krajowej Administracji Skarbowej dane o sprzedawcach, a kopię
 * zestawienia dostaje również sam sprzedawca.
 */
export const DAC7_OD = '1 lipca 2024 roku';
/** Próg liczby transakcji sprzedaży towarów w roku, od którego platforma raportuje. */
export const DAC7_PROG_TRANSAKCJE = 30;
/** Alternatywny próg: wynagrodzenie wypłacone sprzedawcy w ciągu roku (w euro). */
export const DAC7_PROG_EUR = 2000;
/** Termin przekazania raportu za rok poprzedni. */
export const DAC7_RAPORT_DO = 'końca stycznia';

// --- Krajowy System e-Faktur (KSeF) ---
/** Od tego dnia wszyscy przedsiębiorcy odbierają faktury zakupowe przez KSeF. */
export const KSEF_ODBIOR_OD = '1 lutego 2026 roku';
/** Od tego dnia obowiązek wystawiania faktur objął większość firm, w tym mikro i małe. */
export const KSEF_WYSTAWIANIE_OD = '1 kwietnia 2026 roku';
/** Ostatni etap: podmioty o najniższej sprzedaży fakturowanej. */
export const KSEF_NAJMNIEJSI_OD = '1 stycznia 2027 roku';

// --- Działalność nierejestrowana ---
/**
 * Od 2026 r. limit przychodu liczy się kwartalnie, a nie miesięcznie, i wynosi
 * 225% minimalnego wynagrodzenia (dotychczas 75% za każdy miesiąc). Kwota idzie
 * więc za minimalnym wynagrodzeniem i zmienia się razem z nim.
 */
export const NIEREJESTROWANA_WSP = 2.25;
export const NIEREJESTROWANA_LIMIT = round2(MIN_WAGE * NIEREJESTROWANA_WSP); // 10 813,50
/** Ile miesięcy wstecz nie można było prowadzić zarejestrowanej działalności. */
export const NIEREJESTROWANA_PRZERWA_MIESIACE = 60;
/** Termin na złożenie wniosku do CEIDG po przekroczeniu limitu. */
export const NIEREJESTROWANA_CEIDG_DNI = 7;

// --- Sprzedaż do konsumentów z UE (WSTO, usługi elektroniczne, OSS) ---
/**
 * Próg rocznej sprzedaży transgranicznej do konsumentów z innych krajów UE.
 * Po jego przekroczeniu miejscem opodatkowania jest kraj nabywcy, a podatek
 * rozlicza się według tamtejszych stawek - w praktyce przez procedurę OSS.
 */
export const OSS_LIMIT_EUR = 10000;
export const OSS_LIMIT = 42000; // ustawowa równowartość w złotych
/** Ile lat trzeba przechowywać dokumentację transakcji objętych procedurą OSS. */
export const OSS_DOKUMENTACJA_LATA = 10;
/**
 * Procedura importu (IOSS) - sprzedaż konsumentom towarów sprowadzanych spoza
 * Unii o wartości rzeczywistej nieprzekraczającej tego progu. Deklaracje
 * składa się miesięcznie, inaczej niż kwartalne deklaracje OSS.
 */
export const IOSS_LIMIT_EUR = 150;
/**
 * Data, od której miejscem opodatkowania wstępu na wydarzenia transmitowane
 * lub w inny sposób udostępniane wirtualnie jest kraj konsumenta.
 */
export const WYDARZENIA_WIRTUALNE_OD = '1 stycznia 2025 roku';

// --- Kilometrówka ---
// Stawki za 1 km przebiegu. Zmiana stawki na kolejny rok = zmiana wartości tutaj:
// kalkulator, tabela w opisie, FAQ i opis strony biorą liczby z tego miejsca.
export const KM_RATES = {
  osobowyMaly: 0.89, // samochód osobowy poj. ≤ 900 cm³
  osobowyDuzy: 1.15, // samochód osobowy poj. > 900 cm³
  motocykl: 0.69,
  motorower: 0.42,
};
// Kolejność i nazwy pojazdów - używane w selektorze i w tabeli stawek
export const KM_VEHICLES = [
  { value: 'osobowyMaly', label: 'Samochód osobowy ≤ 900 cm³', rate: KM_RATES.osobowyMaly },
  { value: 'osobowyDuzy', label: 'Samochód osobowy > 900 cm³', rate: KM_RATES.osobowyDuzy },
  { value: 'motocykl', label: 'Motocykl', rate: KM_RATES.motocykl },
  { value: 'motorower', label: 'Motorower', rate: KM_RATES.motorower },
] as const;
export const KM_DEFAULT_VEHICLE = 'osobowyDuzy';
// Miesięczne limity ryczałtu na jazdy lokalne (wg liczby mieszkańców gminy)
export const KM_RYCZALT_LIMITS = [
  { label: 'do 100 tys. mieszkańców', km: 300 },
  { label: 'od 100 do 500 tys. mieszkańców', km: 500 },
  { label: 'powyżej 500 tys. mieszkańców', km: 700 },
] as const;

// --- Amortyzacja ---
export const AMORT_JEDNORAZOWA_LIMIT = 213000; // limit jednorazowej amortyzacji (de minimis)
export const AMORT_JEDNORAZOWA_LIMIT_EUR = 50000; // równowartość limitu w euro
export const AMORT_NISKOCENNE = 10000; // wartość, do której można amortyzować jednorazowo
export const AMORT_DEGRESYWNY_WSP = 2.0; // współczynnik metody degresywnej (maks.)
// Przykładowe roczne stawki amortyzacji liniowej (Wykaz stawek).
// Etykieta powstaje ze stawki i nazwy, więc selektor i tabela w opisie
// nigdy się nie rozjadą.
export const AMORT_RATES = [
  { value: 2.5, name: 'budynki' },
  { value: 10, name: 'wyposażenie, lokale' },
  { value: 14, name: 'maszyny i urządzenia' },
  { value: 18, name: 'niektóre urządzenia' },
  { value: 20, name: 'środki transportu' },
  { value: 30, name: 'komputery, elektronika' },
].map((r) => ({ ...r, label: `${pctOf(r.value)} - ${r.name}` }));
