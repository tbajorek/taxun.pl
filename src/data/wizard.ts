/**
 * Schemat kreatora wyceny (/wycena).
 *
 * Jedno źródło prawdy dla trzech miejsc: renderowania formularza po stronie
 * serwera (wycena.astro), logiki widoczności i walidacji po stronie klienta
 * oraz opisania odpowiedzi w wiadomości e-mail (api/wycena.ts). Dzięki temu
 * etykieta pytania i etykieta odpowiedzi w mailu nigdy się nie rozjadą.
 *
 * Kreator obsługuje dwie ścieżki - założenie działalności i przeniesienie
 * księgowości - w jednym, identycznie wyglądającym interfejsie. Różnice
 * między nimi opisujemy deklaratywnie:
 *   - `rule`        - kiedy pytanie / opcja są widoczne,
 *   - `labelByMode` - jak brzmi pytanie w danej ścieżce,
 *   - `requiredWhen`- kiedy pole jest obowiązkowe.
 *
 * Reguła to zestaw warunków na dotychczasowych odpowiedziach:
 *   { when: { legalForm: ['zoo'] } }        -> pokaż, gdy legalForm = zoo
 *   { unless: { mode: ['przeniesienie'] } } -> ukryj w trybie przeniesienia
 * Warunki z `when` łączy AND, wartości wewnątrz jednego pola - OR.
 */

import { bundleDiscount, currencyInvoices, ecommerce, foreignTax, ipBox, ossFees, personalReturns, setupFees, wis } from './pricing';
import {
  IOSS_LIMIT_EUR,
  IP_BOX_RATE,
  OSS_LIMIT_EUR,
  RYCZALT_HANDEL,
  RYCZALT_NAJEM,
  RYCZALT_NAJEM_PROG,
  RYCZALT_NAJEM_WYZSZY,
  RYCZALT_POSREDNICTWO_DETAL,
  VAT_RATE,
  VAT_RATE_OBNIZONA,
  VAT_ZWOLNIENIE_LIMIT,
} from '../lib/tax-constants';
import { num, pct, zl } from '../lib/format';

export type Mode = 'zalozenie' | 'przeniesienie';

/** Wartości pól: pojedynczy wybór / tekst albo lista (pytania wielokrotnego wyboru). */
export type AnswerValue = string | string[];
export type Answers = Record<string, AnswerValue>;

export type Rule = {
  when?: Record<string, string[]>;
  unless?: Record<string, string[]>;
};

export type WizardOption = {
  value: string;
  label: string;
  hint?: string;
  icon?: string;
  badge?: string;
  rule?: Rule;
};

export type QuestionType =
  | 'choice'
  | 'multi'
  | 'text'
  | 'email'
  | 'tel'
  | 'date'
  | 'textarea';

export type Question = {
  id: string;
  type: QuestionType;
  label: string;
  labelByMode?: Partial<Record<Mode, string>>;
  help?: string;
  helpByMode?: Partial<Record<Mode, string>>;
  placeholder?: string;
  placeholderByMode?: Partial<Record<Mode, string>>;
  options?: WizardOption[];
  /**
   * cards - duże kafelki z opisem, pills - zwarte kafelki,
   * chips - tagi wielokrotnego wyboru, slider - suwak po kolejnych opcjach.
   * Suwak zostaje pytaniem jednokrotnego wyboru - zmienia się tylko sposób
   * pokazania tych samych opcji, więc walidacja, podsumowanie i mail działają
   * bez żadnej wiedzy o nim.
   */
  layout?: 'cards' | 'pills' | 'chips' | 'slider';
  columns?: 1 | 2 | 3;
  required?: boolean;
  /** Obowiązkowe tylko w części ścieżek (np. nazwa firmy przy przeniesieniu). */
  requiredWhen?: Rule;
  rule?: Rule;
  /** Doprecyzowanie odpowiedzi powyżej - renderowane jako wcięty blok. */
  attach?: boolean;
  /** Pole na pół szerokości w siatce danych kontaktowych. */
  half?: boolean;
  /** Maksymalna liczba zaznaczeń w pytaniu wielokrotnego wyboru. */
  max?: number;
  validate?: 'email' | 'nip' | 'phone';
  /** Gdy po filtrowaniu zostanie jedna opcja - zaznacz ją i ukryj pytanie. */
  autoSelectSingle?: boolean;
  /**
   * Po pokazaniu pytania od razu ustaw pierwszą opcję. Potrzebne przy suwaku:
   * ten zawsze stoi w jakiejś pozycji, więc brak odpowiedzi rozjeżdżałby się
   * z tym, co widzi użytkownik. Pierwsza opcja jest najtańsza, więc domyślna
   * odpowiedź nigdy nie zawyża wyceny.
   */
  defaultToFirstOption?: boolean;
  /** Pole ustawiane z linku (?plan=) - wtedy pytania nie zadajemy ponownie. */
  lockable?: boolean;
  /** Krótka etykieta do podsumowania i wiadomości e-mail. */
  shortLabel?: string;
  autocomplete?: string;
  inputmode?: string;
  maxlength?: number;
  rows?: number;
  /** Pole ukryte za odnośnikiem "Mam kod polecający". */
  collapsible?: string;
};

export type Step = {
  id: string;
  /** Etykieta w pasku postępu. */
  eyebrow: string;
  title: string;
  titleByMode?: Partial<Record<Mode, string>>;
  /** Nagłówek sekcji w wiadomości e-mail, gdy tytuł kroku jest pytaniem. */
  emailTitle?: string;
  intro?: string;
  introByMode?: Partial<Record<Mode, string>>;
  questions: Question[];
};

/** Formy prawne rozliczane PIT-em wspólnika (ryczałt / skala / liniowy). */
const PIT_FORMS = ['jdg', 'sc', 'jawna', 'inne'];
/** Formy prawne rozliczane CIT-em (klasycznym lub estońskim). */
const CIT_FORMS = ['zoo', 'komandytowa', 'inne'];
/**
 * Branże, w których IP Box w ogóle wchodzi w grę.
 *
 * Ulga dotyczy dochodu z kwalifikowanego prawa własności intelektualnej
 * wytworzonego we własnej działalności badawczo-rozwojowej: autorskiego prawa
 * do programu komputerowego, patentu, wzoru użytkowego lub przemysłowego,
 * topografii układu scalonego, prawa do odmiany rośliny albo ochrony produktu
 * leczniczego. To nie jest ulga wyłącznie dla IT - ma ją też producent
 * z patentem czy biuro projektowe - ale w handlu, transporcie, gastronomii,
 * budownictwie i najmie takie prawo praktycznie się nie zdarza. Tam pytanie
 * byłoby tylko kolejnym obowiązkowym krokiem bez szans na odpowiedź "tak".
 *
 * Branża jest pytaniem wielokrotnego wyboru, a `matchRule` sprawdza części
 * wspólne, więc wystarczy jedno wskazanie z listy (np. "handel" + "IT").
 */
const IP_BOX_INDUSTRIES = [
  'it',
  'ecommerce',
  'marketing',
  'produkcja',
  'uslugi',
  'zdrowie',
  'edukacja',
  'finanse',
  'inna',
];
/**
 * Branże, w których w jednej ofercie spotykają się różne stawki VAT, więc
 * pytanie o wątpliwości klasyfikacyjne ma sens.
 *
 * Beauty ma obniżoną stawkę na zabiegi i podstawową na solarium, masaż czy
 * sprzedaż kosmetyków; gastronomia rozdziela sprzedaż na miejscu i na wynos;
 * handel, e-commerce i produkcja mają obniżone stawki na części asortymentu;
 * budownictwo - stawkę dla budownictwa objętego społecznym programem
 * mieszkaniowym; zdrowie i edukacja - granicę zwolnienia przedmiotowego, przy
 * której szkolenie bywa zwolnione, a coaching czy zautomatyzowany kurs online
 * już nie; sport - granicę między wstępem na obiekt a usługą dodatkową, bo
 * karnet i trening personalny mają różne stawki. W IT, marketingu czy
 * transporcie cała sprzedaż jest zwykle w jednej stawce, więc pytanie byłoby
 * tam tylko kolejnym krokiem bez szans na odpowiedź inną niż pierwsza.
 */
const MIXED_VAT_INDUSTRIES = [
  'beauty',
  'sport',
  'gastronomia',
  'handel',
  'ecommerce',
  'produkcja',
  'budownictwo',
  'zdrowie',
  'edukacja',
  'inna',
];

/**
 * Kategorie asortymentu, przy których sprzedaż na odległość wyklucza
 * zwolnienie ze względu na wartość sprzedaży (art. 113 ust. 13 ustawy o VAT).
 * Zaznaczenie którejkolwiek z nich odbiera opcję "zwolnienie z VAT" w pytaniu
 * o status VAT, bo przy takim asortymencie zwolnienie nie przysługuje od
 * pierwszej transakcji, niezależnie od obrotu.
 */
export const VAT_EXCLUDED_GOODS = ['kosmetyki', 'elektronika', 'agd', 'czesci'];

/**
 * Odpowiedzi na pytanie o pracodawcę, przy których nowa działalność powiela
 * czynności z etatu. Ryczałt wyklucza każda z nich, podatek liniowy - tylko
 * ta z etatem w bieżącym roku.
 */
const EMPLOYER_SAME_WORK = ['tak-ten-rok', 'tak-zeszly-rok'];

/**
 * Formy prawne, w których zawieszenie działalności w ogóle wchodzi w grę.
 *
 * Zawieszenie zgłasza przedsiębiorca wpisany do CEIDG - jednoosobowa
 * działalność, także prowadzona jako spółka cywilna, gdzie skutek nastąpi
 * dopiero wtedy, gdy zgłoszą je wszyscy wspólnicy - albo spółka wpisana do
 * rejestru przedsiębiorców KRS: jawna, komandytowa i z o.o.
 *
 * "Inna forma" na tej liście nie stoi, bo pod tą odpowiedzią kryje się
 * zarówno spółka akcyjna, jak i fundacja, a fundacja bywa wpisana wyłącznie
 * do rejestru stowarzyszeń, gdzie nie ma czego zawieszać. Nie wiemy więc
 * z góry, czy pytanie ma sens - ustalamy to na konsultacji, zamiast zadawać
 * je w formularzu z góry przesądzoną odpowiedzią.
 */
const SUSPENDABLE_FORMS = ['jdg', 'sc', 'jawna', 'zoo', 'komandytowa'];

/** Każdy pakiet z cennika - obecność któregokolwiek oznacza wejście z /cennik. */
const ANY_PLAN = ['ryczalt', 'kpir', 'fk'];

/**
 * Kolejne pozycje suwaka "faktury walutowe". Każdy dokument ponad limit
 * kosztuje osobno, więc przedziały ("6 - 20") źle oddawały cenę: liczyliśmy
 * wtedy od dolnej granicy i wybór 20 faktur kosztował tyle, co wybór 6.
 * Suwak podaje konkretną liczbę, a ostatnia pozycja jest otwarta - przy niej
 * wycena pokazuje "od".
 */
export const CURRENCY_STOPS = [5, 10, 15, 20, 25];

/** Wartość ostatniej, otwartej pozycji suwaka (np. "25+"). */
export const CURRENCY_OPEN_VALUE = `${CURRENCY_STOPS[CURRENCY_STOPS.length - 1]}+`;

const currencySurcharge = (count: number): number =>
  Math.max(0, count - currencyInvoices.freeLimit) * currencyInvoices.rate;

const currencyOptions: WizardOption[] = [
  ...CURRENCY_STOPS.map((count, i) => ({
    value: String(count),
    label: i === 0 ? `${count} i mniej` : String(count),
    hint:
      currencySurcharge(count) === 0
        ? 'W cenie abonamentu'
        : `+${currencySurcharge(count)} zł / mies.`,
  })),
  {
    value: CURRENCY_OPEN_VALUE,
    label: `więcej niż ${CURRENCY_STOPS[CURRENCY_STOPS.length - 1]}`,
    hint: `od +${currencySurcharge(CURRENCY_STOPS[CURRENCY_STOPS.length - 1])} zł / mies.`,
  },
];

export const steps: Step[] = [
  {
    id: 'start',
    eyebrow: 'Sytuacja',
    title: 'Od czego zaczynamy?',
    emailTitle: 'Sytuacja klienta',
    intro: 'Im lepiej poznamy Twoją sytuację, tym konkretniejsza będzie nasza odpowiedź. Całość zajmuje około dwóch minut.',
    questions: [
      {
        id: 'mode',
        type: 'choice',
        layout: 'cards',
        columns: 2,
        required: true,
        label: 'Czego dotyczy zgłoszenie?',
        shortLabel: 'Zgłoszenie',
        options: [
          {
            value: 'zalozenie',
            label: 'Zakładam nową firmę',
            hint: 'Chcę wystartować z działalnością i mieć księgowość dobrze ustawioną od pierwszego dnia.',
            icon: 'sparkle',
          },
          {
            value: 'przeniesienie',
            label: 'Przenoszę księgowość',
            hint: 'Firma już działa i szukam biura, które poprowadzi ją sprawniej.',
            icon: 'briefcase',
          },
        ],
      },
      {
        id: 'legalForm',
        type: 'choice',
        layout: 'cards',
        columns: 3,
        required: true,
        label: 'Forma prawna',
        labelByMode: {
          zalozenie: 'Jaką formę prawną chcesz założyć?',
          przeniesienie: 'W jakiej formie prawnej działasz?',
        },
        shortLabel: 'Forma prawna',
        options: [
          {
            value: 'jdg',
            label: 'Jednoosobowa działalność',
            hint: 'JDG w CEIDG, rozliczenie PIT właściciela',
            icon: 'briefcase',
          },
          {
            value: 'sc',
            label: 'Spółka cywilna',
            hint: 'Umowa wspólników, PIT u każdego z nich',
            icon: 'users',
          },
          {
            value: 'jawna',
            label: 'Spółka jawna',
            hint: 'Spółka osobowa wpisana do KRS',
            icon: 'users',
          },
          {
            value: 'zoo',
            label: 'Spółka z o.o.',
            hint: 'CIT i pełna księgowość',
            icon: 'shield',
            rule: { unless: { planTable: ['ryczalt', 'kpir'] } },
          },
          {
            value: 'komandytowa',
            label: 'Spółka komandytowa',
            hint: 'Komplementariusz i komandytariusz, CIT',
            icon: 'shield',
            rule: { unless: { planTable: ['ryczalt', 'kpir'] } },
          },
          {
            value: 'inne',
            label: 'Inna forma',
            hint: 'Partnerska, akcyjna, P.S.A., fundacja',
            icon: 'file',
          },
          {
            value: 'nie-wiem',
            label: 'Jeszcze nie wiem',
            hint: 'Dobierzemy formę do skali i planów firmy',
            icon: 'headset',
            rule: { when: { mode: ['zalozenie'] }, unless: { planTable: ANY_PLAN } },
          },
        ],
      },
      {
        id: 'legalFormOther',
        type: 'text',
        attach: true,
        required: true,
        rule: { when: { legalForm: ['inne'] } },
        label: 'Doprecyzuj formę prawną',
        shortLabel: 'Forma prawna (opis)',
        placeholder: 'np. spółka partnerska, prosta spółka akcyjna, fundacja',
        maxlength: 120,
      },
    ],
  },

  {
    id: 'profil',
    eyebrow: 'Profil',
    title: 'Profil działalności',
    emailTitle: 'Profil działalności',
    titleByMode: {
      zalozenie: 'Czym będzie zajmować się firma?',
      przeniesienie: 'Czym zajmuje się Twoja firma?',
    },
    intro: 'Branża i skala przychodów decydują o stawce ryczałtu, limitach VAT i tym, na co zwrócimy uwagę w wycenie.',
    questions: [
      {
        id: 'industry',
        type: 'multi',
        layout: 'chips',
        required: true,
        max: 3,
        label: 'Branża',
        help: 'Możesz wskazać maksymalnie trzy obszary.',
        shortLabel: 'Branża',
        options: [
          { value: 'it', label: 'IT i programowanie' },
          { value: 'marketing', label: 'Marketing i reklama' },
          { value: 'ecommerce', label: 'E-commerce' },
          { value: 'handel', label: 'Handel i dystrybucja' },
          { value: 'budownictwo', label: 'Budownictwo i instalacje' },
          { value: 'transport', label: 'Transport i logistyka' },
          { value: 'gastronomia', label: 'Gastronomia i hotelarstwo' },
          { value: 'zdrowie', label: 'Zdrowie i medycyna' },
          { value: 'beauty', label: 'Beauty, kosmetyka i fryzjerstwo' },
          { value: 'edukacja', label: 'Edukacja i szkolenia' },
          { value: 'sport', label: 'Sport, fitness i rekreacja' },
          { value: 'bhp', label: 'BHP i ochrona przeciwpożarowa' },
          { value: 'nieruchomosci', label: 'Nieruchomości i najem' },
          { value: 'produkcja', label: 'Produkcja i rzemiosło' },
          { value: 'uslugi', label: 'Usługi profesjonalne' },
          { value: 'finanse', label: 'Finanse i ubezpieczenia' },
          { value: 'inna', label: 'Inna branża' },
        ],
      },
      {
        id: 'industryOther',
        type: 'text',
        attach: true,
        required: true,
        rule: { when: { industry: ['inna'] } },
        label: 'Opisz krótko, czym się zajmujesz',
        shortLabel: 'Branża (opis)',
        placeholder: 'np. fotografia produktowa, wynajem sprzętu budowlanego',
        maxlength: 160,
      },
      {
        /**
         * Pytanie kwalifikujące dla ścieżki e-commerce. Odpowiedź twierdząca
         * odsłania pytania o asortyment, model sprzedaży, kanały i wolumen
         * transakcji - w pozostałych branżach formularz zostaje bez zmian.
         * Bez tego kwalifikatora pytalibyśmy fryzjera o magazyn w Niemczech.
         */
        id: 'ecommerce',
        type: 'choice',
        layout: 'pills',
        columns: 2,
        required: true,
        label: 'Sprzedaż internetowa',
        labelByMode: {
          zalozenie: 'Czy planujesz sprzedaż przez internet?',
          przeniesienie: 'Czy prowadzisz sprzedaż przez internet?',
        },
        help: 'Liczy się własny sklep oraz sprzedaż na platformach takich jak Allegro, Amazon czy Etsy. Jeśli tak, zadamy kilka dodatkowych pytań - w e-commerce decydują one zarówno o cenie obsługi, jak i o obowiązkach w VAT.',
        shortLabel: 'Sprzedaż internetowa',
        options: [
          { value: 'tak', label: 'Tak', hint: 'Własny sklep albo platforma sprzedażowa' },
          { value: 'nie', label: 'Nie' },
        ],
      },
      {
        /**
         * Asortyment rozstrzyga o statusie VAT, a nie o cenie. Przy sprzedaży
         * na odległość kategorie z VAT_EXCLUDED_GOODS wykluczają zwolnienie od
         * pierwszej transakcji, więc ich zaznaczenie odbiera opcję
         * "zwolnienie z VAT" w pytaniu o status VAT.
         */
        id: 'ecomGoods',
        type: 'multi',
        layout: 'chips',
        required: true,
        rule: { when: { ecommerce: ['tak'] } },
        label: 'Co sprzedajesz?',
        help: `Pytamy o to, ponieważ przy sprzedaży na odległość część asortymentu wyklucza zwolnienie z VAT od pierwszej transakcji, niezależnie od obrotu i od limitu ${zl(VAT_ZWOLNIENIE_LIMIT)}. Jeśli zaznaczysz którąkolwiek z pierwszych czterech pozycji, dalej policzymy wycenę dla czynnego podatnika VAT.`,
        shortLabel: 'Asortyment',
        options: [
          { value: 'kosmetyki', label: 'Kosmetyki i perfumy' },
          { value: 'elektronika', label: 'Elektronika i komputery' },
          { value: 'agd', label: 'Sprzęt AGD' },
          { value: 'czesci', label: 'Części samochodowe' },
          { value: 'inne', label: 'Inny asortyment' },
        ],
      },
      {
        /**
         * Nie wpływa na cenę obsługi, ale przesądza o stawce ryczałtu, więc
         * pozwala przygotować się do rozmowy i wyłapać klienta rozliczanego
         * dotychczas błędnie.
         */
        id: 'ecomModel',
        type: 'choice',
        layout: 'pills',
        columns: 3,
        required: true,
        rule: { when: { ecommerce: ['tak'] } },
        label: 'Model sprzedaży',
        labelByMode: {
          zalozenie: 'Czy zamierzasz sprzedawać we własnym imieniu, czy pośredniczyć?',
          przeniesienie: 'Sprzedajesz we własnym imieniu, czy pośredniczysz?',
        },
        help: `O stawce ryczałtu decyduje treść umowy z dostawcą, a nie nazwa modelu. Przy sprzedaży we własnym imieniu przychodem jest pełna wpłata klienta i właściwa jest stawka ${pct(RYCZALT_HANDEL)}. Przy pośrednictwie przychodem jest sama prowizja, więc stawka ${pct(RYCZALT_POSREDNICTWO_DETAL)} liczy się od znacznie mniejszej podstawy.`,
        shortLabel: 'Model sprzedaży',
        options: [
          { value: 'wlasne', label: 'Kupuję i odsprzedaję', hint: 'Jestem stroną umowy z kupującym' },
          { value: 'posrednictwo', label: 'Pośredniczę za prowizję', hint: 'Umowę zawiera klient z dostawcą' },
          { value: 'nie-wiem', label: 'Nie jestem pewien', hint: 'Sprawdzimy to na umowach i regulaminie sklepu' },
        ],
      },
      {
        id: 'revenue',
        type: 'choice',
        layout: 'pills',
        columns: 3,
        required: true,
        label: 'Roczny przychód',
        labelByMode: {
          zalozenie: 'Jakiego przychodu spodziewasz się w pierwszym roku?',
          przeniesienie: 'Jaki jest roczny przychód firmy?',
        },
        help: 'Potrzebujemy widełek, nie dokładnej kwoty. Od nich zależy limit ryczałtu, status małego podatnika i moment przejścia na pełne księgi.',
        shortLabel: 'Przychód roczny',
        options: [
          { value: 'do-200', label: 'do 200 tys. zł' },
          { value: '200-1000', label: '200 tys. - 1 mln zł' },
          { value: '1000-2000', label: '1 - 2 mln zł' },
          { value: '2000-5000', label: '2 - 5 mln zł' },
          { value: 'pow-5000', label: 'powyżej 5 mln zł' },
          {
            value: 'nie-wiem',
            label: 'Trudno oszacować',
            rule: { when: { mode: ['zalozenie'] } },
          },
        ],
      },
    ],
  },

  {
    id: 'podatki',
    eyebrow: 'Podatki',
    title: 'Podatki i VAT',
    intro: 'Pokazujemy tylko te formy rozliczenia, które są dostępne dla wybranej formy prawnej.',
    introByMode: {
      przeniesienie: 'Pokazujemy tylko te formy rozliczenia, które są dostępne dla wybranej formy prawnej.',
      zalozenie: 'Nie musisz być pewien. Jeśli wybierzesz „nie wiem”, policzymy warianty i podpowiemy najkorzystniejszy.',
    },
    questions: [
      {
        /**
         * Praca dla własnego pracodawcy wyklucza dwie formy opodatkowania, ale
         * każdą w innym oknie czasowym:
         *   - ryczałt (art. 8 ust. 2 ustawy o zryczałtowanym podatku
         *     dochodowym) odpada, gdy te same czynności były wykonywane na
         *     etacie w tym roku ALBO w poprzednim,
         *   - podatek liniowy (art. 9a ust. 3 ustawy o PIT) odpada tylko
         *     wtedy, gdy etat i współpraca trafiają na ten sam rok podatkowy.
         * Obie zasady mówią o pokrywaniu się czynności, a nie o samym fakcie
         * współpracy z byłym pracodawcą. Dlatego jedno pytanie rozstrzyga oba
         * warunki naraz - zakres czynności i rok etatu - zamiast pytania
         * głównego i doprecyzowującego. Zatrudnienie dawniejsze niż poprzedni
         * rok nie ogranicza już niczego, więc mieści się w odpowiedzi "nie".
         *
         * Pytanie zadajemy tylko przy jednoosobowej działalności - w spółce
         * ograniczenie dotyczy wspólnika i jego własnej historii zatrudnienia,
         * więc ustalamy je na konsultacji.
         */
        id: 'formerEmployer',
        type: 'choice',
        layout: 'pills',
        columns: 2,
        required: true,
        rule: { when: { legalForm: ['jdg'] } },
        label: 'Usługi dla byłego pracodawcy',
        labelByMode: {
          zalozenie: 'Czy będziesz świadczyć usługi dla obecnego lub byłego pracodawcy?',
          przeniesienie: 'Czy świadczysz usługi dla obecnego lub byłego pracodawcy?',
        },
        help: 'Chodzi o pracodawcę, u którego pracujesz albo pracowałeś na etacie w tym lub w poprzednim roku - wcześniejsze zatrudnienie niczego już nie ogranicza. Ryczałt odpada, gdy wykonujesz dla niego te same czynności co na umowie o pracę, a podatek liniowy - gdy etat i współpraca trafiają na ten sam rok.',
        shortLabel: 'Usługi dla byłego pracodawcy',
        options: [
          { value: 'nie', label: 'Nie', hint: 'Albo etat skończył się dawniej niż w zeszłym roku' },
          {
            value: 'inne',
            label: 'Tak, ale w innym zakresie',
            hint: 'Inne czynności niż na etacie - ryczałt i liniówka zostają dostępne',
          },
          {
            value: 'tak-ten-rok',
            label: 'Tak, te same czynności co na etacie w tym roku',
            hint: 'Zostaje skala podatkowa - ryczałt i liniówka nie przysługują',
          },
          {
            value: 'tak-zeszly-rok',
            label: 'Tak, te same czynności, ale etat skończył się w zeszłym roku',
            hint: 'Ryczałt nie przysługuje, podatek liniowy zostaje dostępny',
          },
        ],
      },
      {
        id: 'taxForm',
        type: 'choice',
        layout: 'cards',
        columns: 2,
        required: true,
        autoSelectSingle: true,
        lockable: true,
        rule: { unless: { legalForm: ['nie-wiem'] } },
        label: 'Forma opodatkowania',
        labelByMode: {
          zalozenie: 'Jaką formę opodatkowania preferujesz?',
          przeniesienie: 'Jak rozliczasz się dzisiaj?',
        },
        shortLabel: 'Forma opodatkowania',
        options: [
          {
            value: 'ryczalt',
            label: 'Ryczałt ewidencjonowany',
            hint: 'Podatek od przychodu, stawki 2 - 17%, bez rozliczania kosztów',
            icon: 'zap',
            rule: {
              when: { legalForm: PIT_FORMS },
              unless: { planTable: ['kpir', 'fk'], formerEmployer: EMPLOYER_SAME_WORK },
            },
          },
          {
            value: 'skala',
            label: 'Skala podatkowa 12% / 32%',
            hint: 'KPiR, kwota wolna, ulgi i wspólne rozliczenie z małżonkiem',
            icon: 'chart',
            rule: { when: { legalForm: PIT_FORMS }, unless: { planTable: ['ryczalt'] } },
          },
          {
            value: 'liniowy',
            label: 'Podatek liniowy 19%',
            hint: 'KPiR, stała stawka niezależnie od wysokości dochodu',
            icon: 'trending-up',
            rule: {
              when: { legalForm: PIT_FORMS },
              unless: { planTable: ['ryczalt'], formerEmployer: ['tak-ten-rok'] },
            },
          },
          {
            value: 'karta',
            label: 'Karta podatkowa',
            hint: 'Kontynuacja rozliczenia sprzed 2022 roku',
            icon: 'file',
            rule: {
              when: { mode: ['przeniesienie'], legalForm: ['jdg'] },
              unless: { planTable: ANY_PLAN },
            },
          },
          {
            value: 'cit',
            label: 'CIT 9% lub 19%',
            hint: 'Klasyczne rozliczenie spółki, pełna księgowość',
            icon: 'shield',
            rule: { when: { legalForm: CIT_FORMS }, unless: { planTable: ['ryczalt', 'kpir'] } },
          },
          {
            value: 'cit-estonski',
            label: 'Estoński CIT',
            hint: 'Podatek dopiero przy wypłacie zysku ze spółki',
            icon: 'sparkle',
            rule: { when: { legalForm: CIT_FORMS }, unless: { planTable: ['ryczalt', 'kpir'] } },
          },
          {
            value: 'nie-wiem',
            label: 'Nie wiem, potrzebuję rekomendacji',
            hint: 'Porównamy warianty na Twoich liczbach i wskażemy najkorzystniejszy',
            icon: 'headset',
            rule: { when: { mode: ['zalozenie'] }, unless: { planTable: ANY_PLAN } },
          },
        ],
      },
      {
        /**
         * Pytanie ma dwa warunki. Forma opodatkowania jest twarda: IP Box
         * łączy się wyłącznie ze skalą, liniówką i klasycznym CIT-em, bo na
         * ryczałcie ulga nie przysługuje, a estoński CIT ją wyklucza. Branża
         * jest warunkiem praktycznym - odsiewa firmy, w których kwalifikowane
         * prawo się nie pojawia (patrz IP_BOX_INDUSTRIES). Przy każdej
         * odpowiedzi spoza tych dwóch list pytania nie zadajemy, a reguła
         * wycina je razem z pozycją w wycenie i w mailu.
         */
        id: 'ipBox',
        type: 'choice',
        layout: 'pills',
        columns: 3,
        required: true,
        rule: { when: { taxForm: ['skala', 'liniowy', 'cit'], industry: IP_BOX_INDUSTRIES } },
        label: 'Ulga IP Box',
        labelByMode: {
          zalozenie: 'Czy planujesz korzystać z ulgi IP Box?',
          przeniesienie: 'Czy korzystasz z ulgi IP Box?',
        },
        help: `Preferencyjna stawka ${pct(IP_BOX_RATE)} od dochodu z kwalifikowanego prawa własności intelektualnej, u programistów zwykle z autorskiego prawa do programu komputerowego, w produkcji z patentu lub wzoru użytkowego. Wymaga odrębnej ewidencji prowadzonej na bieżąco - prowadzimy ją za ${ipBox.monthly} zł netto miesięcznie za jedno kwalifikowane prawo, razem z załącznikiem PIT/IP do rocznego zeznania.`,
        shortLabel: 'IP Box',
        options: [
          { value: 'tak', label: 'Tak', hint: 'Prowadzimy ewidencję i liczymy wskaźnik nexus' },
          { value: 'nie', label: 'Nie' },
          {
            value: 'nie-wiem',
            label: 'Nie wiem, sprawdźcie to',
            hint: 'Ocenimy kwalifikowalność na bezpłatnej rozmowie wstępnej',
          },
        ],
      },
      {
        /**
         * Najem prywatny to odrębne od działalności źródło przychodu, więc
         * pytanie zadajemy w obu ścieżkach - mieszkanie na wynajem ma tak samo
         * ten, kto dopiero zakłada firmę, jak ten, kto przenosi księgowość.
         *
         * Na wycenę odpowiedź przekłada się przez liczbę zeznań, a nie przez
         * liczbę źródeł przychodu. Najem prywatny rozlicza się ryczałtem, więc
         * u ryczałtowca wchodzi do tego samego PIT-28, który i tak składamy za
         * działalność - wtedy nie doliczamy nic. Przy pozostałych formach
         * roczne zeznanie z firmy to inny druk, więc PIT-28 od najmu jest
         * dodatkowym dokumentem i wtedy kosztuje. Najem prowadzony w ramach
         * działalności nie dokłada nic nigdy - jego przychód wchodzi do
         * rozliczenia firmy.
         */
        id: 'privateRent',
        type: 'choice',
        layout: 'pills',
        columns: 2,
        required: true,
        label: 'Najem nieruchomości',
        labelByMode: {
          zalozenie: 'Czy poza działalnością będziesz wynajmować nieruchomości?',
          przeniesienie: 'Czy poza działalnością wynajmujesz nieruchomości?',
        },
        help: `Chodzi o mieszkanie, lokal, garaż albo miejsce postojowe wynajmowane prywatnie, na własne nazwisko. Taki najem rozlicza się wyłącznie ryczałtem: ${pct(RYCZALT_NAJEM)} do ${zl(RYCZALT_NAJEM_PROG)} przychodu w roku i ${pct(RYCZALT_NAJEM_WYZSZY)} od nadwyżki. Jeśli Twoja firma też jest na ryczałcie, najem wchodzi do tego samego PIT-28 osobną rubryką i nie doliczamy za niego nic. Przy skali, liniówce, karcie i w spółce roczne zeznanie z firmy to inny druk, więc PIT-28 od najmu jest dodatkowym dokumentem za ${personalReturns.rent} zł. Pytamy też dlatego, że najem długoterminowy wchodzi do limitu zwolnienia z VAT razem z przychodami firmy.`,
        shortLabel: 'Najem prywatny',
        options: [
          { value: 'nie', label: 'Nie wynajmuję' },
          {
            value: 'prywatny',
            label: 'Tak, poza działalnością',
            hint: 'Ryczałt i roczny PIT-28 - jeden z Twoją firmą albo osobny',
          },
          {
            value: 'firma',
            label: 'Tak, w ramach działalności',
            hint: 'Bez dopłaty - przychód wchodzi do rozliczenia firmy',
          },
          {
            value: 'nie-wiem',
            label: 'Nie wiem, jak go rozliczyć',
            hint: 'Sprawdzimy, czy najem może zostać poza firmą',
          },
        ],
      },
      {
        id: 'vat',
        type: 'choice',
        layout: 'pills',
        columns: 3,
        required: true,
        lockable: true,
        label: 'Status VAT',
        labelByMode: {
          zalozenie: 'Czy chcesz być czynnym podatnikiem VAT?',
          przeniesienie: 'Jaki masz status VAT?',
        },
        shortLabel: 'VAT',
        options: [
          { value: 'czynny', label: 'Czynny podatnik VAT', hint: 'Faktury z VAT, JPK_V7, odliczenie podatku' },
          {
            value: 'zwolniony',
            label: 'Zwolnienie z VAT',
            hint: `Limit ${zl(VAT_ZWOLNIENIE_LIMIT)} lub zwolnienie przedmiotowe`,
            // Przy sprzedaży na odległość kosmetyków, elektroniki, AGD i części
            // zwolnienie nie przysługuje od pierwszej transakcji, więc nie
            // pokazujemy opcji, której klient i tak nie mógłby wybrać.
            rule: { unless: { ecomGoods: VAT_EXCLUDED_GOODS } },
          },
          {
            value: 'nie-wiem',
            label: 'Nie wiem, doradźcie mi',
            rule: { when: { mode: ['zalozenie'] } },
          },
        ],
      },
      {
        /**
         * Wątpliwość co do stawki jest osobnym problemem niż sam podział
         * sprzedaży: podział prowadzimy w abonamencie, a rozstrzygnięcie
         * klasyfikacji wymaga wniosku o wiążącą informację stawkową, który
         * jest usługą dodatkową. Pytanie ma dwa warunki. Stawki sprzedaży
         * rozstrzyga się dopiero u czynnego podatnika - przy zwolnieniu z VAT
         * (i dopóki klient nie wie, czy chce być czynnym podatnikiem) nie ma
         * czego dzielić między stawki, więc pytania nie zadajemy. Drugim
         * warunkiem jest branża, w której różne stawki faktycznie się
         * spotykają (MIXED_VAT_INDUSTRIES).
         */
        id: 'vatRates',
        type: 'choice',
        layout: 'pills',
        columns: 2,
        required: true,
        rule: { when: { vat: ['czynny'], industry: MIXED_VAT_INDUSTRIES } },
        label: 'Stawki VAT w ofercie',
        labelByMode: {
          zalozenie: 'Czy wiesz, jakie stawki VAT będą miały Twoje usługi i towary?',
          przeniesienie: 'Czy stawki VAT w Twojej ofercie są jednoznaczne?',
        },
        help: `Podział sprzedaży między stawki i proporcję odliczenia prowadzimy w abonamencie. Osobną sprawą jest pozycja, przy której sama stawka budzi wątpliwości - wtedy klasyfikację zabezpiecza wiążąca informacja stawkowa, czyli decyzja Dyrektora Krajowej Informacji Skarbowej wydawana w ciągu ${wis.months} miesięcy. Koszt wniosku podajemy przy odpowiedzi, której dotyczy.`,
        shortLabel: 'Stawki VAT',
        options: [
          { value: 'jedna', label: 'Cała sprzedaż w jednej stawce' },
          {
            value: 'mieszane',
            label: 'Kilka stawek, ale wiem które',
            hint: `Np. ${pct(VAT_RATE_OBNIZONA)} na usługi i ${pct(VAT_RATE)} na towary - podział prowadzimy w abonamencie`,
          },
          {
            value: 'watpliwosc',
            label: 'Część pozycji budzi wątpliwości',
            hint: `Wniosek o wiążącą informację stawkową to ${wis.first} zł netto za pierwszą usługę i ${wis.next} zł za każdą kolejną, plus ${wis.fee} zł opłaty urzędowej od każdej z nich`,
          },
          {
            value: 'nie-wiem',
            label: 'Nie wiem, sprawdźcie to',
            hint: 'Przejdziemy przez cennik pozycja po pozycji na konsultacji',
          },
        ],
      },
      {
        id: 'foreign',
        type: 'choice',
        layout: 'pills',
        columns: 2,
        required: true,
        label: 'Transakcje zagraniczne',
        labelByMode: {
          zalozenie: 'Czy planujesz sprzedaż poza Polskę?',
          przeniesienie: 'Czy prowadzisz sprzedaż poza Polskę?',
        },
        shortLabel: 'Sprzedaż zagraniczna',
        options: [
          { value: 'nie', label: 'Nie, wyłącznie Polska' },
          { value: 'ue', label: 'Tak, kraje UE', hint: 'VAT-UE, WDT / WNT, procedura OSS' },
          { value: 'poza-ue', label: 'Tak, poza UE', hint: 'Eksport towarów, import usług' },
          { value: 'ue-poza', label: 'Tak, UE i poza UE' },
          {
            value: 'nie-wiem',
            label: 'Jeszcze nie wiem',
            rule: { when: { mode: ['zalozenie'] } },
          },
        ],
      },
      {
        /**
         * Procedura OSS dotyczy sprzedaży do osób prywatnych, nie do firm, a
         * pytanie `foreign` powyżej tego nie rozstrzyga. Pytamy więc tylko
         * sprzedawców internetowych deklarujących sprzedaż do Unii.
         */
        id: 'ecomB2c',
        type: 'choice',
        layout: 'pills',
        columns: 3,
        required: true,
        rule: { when: { ecommerce: ['tak'], foreign: ['ue', 'ue-poza'] } },
        label: 'Sprzedaż do konsumentów w Unii Europejskiej',
        shortLabel: 'Sprzedaż B2C do UE',
        help: `Po przekroczeniu progu ${num(OSS_LIMIT_EUR)} euro, liczonego łącznie dla całej Unii, podatek od sprzedaży osobom prywatnym rozlicza się według stawek kraju kupującego. Służy do tego moduł OSS: rejestracja kosztuje ${ossFees.ossSetup} zł jednorazowo, a obsługa wraz z deklaracjami kwartalnymi ${ossFees.ossMonthly} zł netto miesięcznie. Sprzedaż firmom z Unii rozliczamy w abonamencie, bez dopłat.`,
        options: [
          { value: 'tak', label: 'Tak, osobom prywatnym', hint: 'Rozliczamy w procedurze OSS' },
          { value: 'firmy', label: 'Nie, wyłącznie firmom', hint: 'VAT-UE i odwrotne obciążenie, w abonamencie' },
          { value: 'nie-wiem', label: 'Nie wiem' },
        ],
      },
      {
        /**
         * Procedura IOSS to osobny obieg od OSS i osobna pozycja cennika, więc
         * musi mieć własne pytanie - bez niego moduł nigdy nie trafiłby do
         * wyceny. Nie pytamy o sprzedaż zagraniczną, bo IOSS uruchamia strona
         * dostawy, a nie kupującego: sklep wysyłający polskiemu konsumentowi
         * towar prosto z Chin jest w procedurze, choć poza Polskę nie sprzedaje
         * ani złotówki.
         */
        id: 'ecomIoss',
        type: 'choice',
        layout: 'pills',
        columns: 3,
        required: true,
        rule: { when: { ecommerce: ['tak'] } },
        label: 'Towar wysyłany do klienta spoza Unii',
        labelByMode: {
          zalozenie: 'Czy towar ma iść do klienta bezpośrednio spoza Unii?',
          przeniesienie: 'Czy towar idzie do klienta bezpośrednio spoza Unii?',
        },
        help: `Chodzi o przesyłki do konsumenta o wartości do ${num(IOSS_LIMIT_EUR)} euro, wysyłane wprost od dostawcy spoza Unii - najczęściej w dropshippingu. Rozlicza je procedura IOSS: rejestracja ${ossFees.iossSetup} zł jednorazowo, obsługa ${ossFees.iossMonthly} zł netto miesięcznie. Stawka jest wyższa niż w OSS, bo deklaracje składa się co miesiąc, a nie co kwartał.`,
        shortLabel: 'Wysyłka spoza Unii (IOSS)',
        options: [
          { value: 'tak', label: 'Tak', hint: 'Rozliczamy w procedurze IOSS' },
          { value: 'nie', label: 'Nie, wysyłam z Polski' },
          { value: 'nie-wiem', label: 'Nie wiem' },
        ],
      },
      {
        /**
         * Magazyn poza Polską oznacza obowiązek rejestracji do VAT w kraju
         * magazynu, którego procedura OSS nie zastępuje. Rejestracji
         * zagranicznych nie prowadzimy, więc odpowiedź nie wchodzi do wyceny -
         * trafia do wiadomości jako zastrzeżenie zakresu.
         */
        id: 'ecomWarehouse',
        type: 'choice',
        layout: 'pills',
        columns: 3,
        required: true,
        rule: { when: { ecommerce: ['tak'] } },
        label: 'Magazyn poza Polską',
        labelByMode: {
          zalozenie: 'Czy planujesz przechowywać towar poza Polską?',
          przeniesienie: 'Czy Twój towar jest przechowywany poza Polską?',
        },
        help: 'Chodzi również o magazyny operatorów logistycznych i platform sprzedażowych. Przechowywanie towaru w innym kraju rodzi obowiązek rejestracji do VAT w tym kraju, a procedura OSS tego nie zastępuje. Rejestracji zagranicznych nie prowadzimy samodzielnie - wskazujemy wyspecjalizowanego partnera i zostajemy przy polskiej części rozliczeń.',
        shortLabel: 'Magazyn poza Polską',
        options: [
          { value: 'nie', label: 'Nie, towar jest w Polsce' },
          { value: 'tak', label: 'Tak, poza Polską' },
          { value: 'nie-wiem', label: 'Nie wiem' },
        ],
      },
      {
        id: 'currencyDocs',
        type: 'choice',
        layout: 'slider',
        required: true,
        defaultToFirstOption: true,
        rule: { when: { foreign: ['ue', 'poza-ue', 'ue-poza'] } },
        label: 'Ile faktur walutowych miesięcznie?',
        labelByMode: {
          zalozenie: 'Ile faktur walutowych przewidujesz miesięcznie?',
          przeniesienie: 'Ile faktur walutowych wystawiasz miesięcznie?',
        },
        help: `Do ${currencyInvoices.freeLimit} dokumentów walutowych miesięcznie jest w abonamencie. Każdy kolejny to ${currencyInvoices.rate} zł. Wystarczy przybliżona liczba - dokładną ustalimy przy wycenie.`,
        shortLabel: 'Faktury walutowe',
        options: currencyOptions,
      },
      {
        /**
         * Pytanie o zakupy, nie o sprzedaż - `foreign` powyżej dotyczy tego,
         * komu klient wystawia faktury, a te dwa obowiązki bierze się z drugiej
         * strony transakcji. Zakup narzędzia albo reklamy od podmiotu
         * zagranicznego to import usług, a przy zwolnieniu z VAT dochodzi do
         * tego deklaracja VAT-9M. Reklamy dodatkowo rodzą obowiązek
         * informacyjny w podatku u źródła, czyli IFT-2R.
         */
        id: 'foreignBuy',
        type: 'choice',
        layout: 'pills',
        columns: 2,
        required: true,
        label: 'Zakupy od firm zagranicznych',
        labelByMode: {
          zalozenie: 'Czy planujesz kupować usługi od firm zagranicznych?',
          przeniesienie: 'Czy kupujesz usługi od firm zagranicznych?',
        },
        help: `Chodzi o zakupy, nie o sprzedaż. Subskrypcja narzędzia online, reklama w serwisie zagranicznym oraz prowizja potrącana przez zagraniczną platformę to import usług. Przy zwolnieniu z VAT taki zakup wymaga rejestracji do VAT-UE jeszcze przed pierwszą fakturą, a potem deklaracji VAT-9M za każdy miesiąc, w którym wystąpił - to moduł VAT-UE za ${foreignTax.vat9m} zł netto. Zakup reklam rodzi dodatkowo obowiązek złożenia rocznej informacji IFT-2R (${foreignTax.ift2rFirst} zł za pierwszego kontrahenta, ${foreignTax.ift2rNext} zł za każdego kolejnego). Weryfikacja obowiązku i sama rejestracja do VAT-UE są w abonamencie.`,
        shortLabel: 'Zakupy zagraniczne',
        options: [
          { value: 'nie', label: 'Nie kupuję' },
          { value: 'narzedzia', label: 'Narzędzia i subskrypcje', hint: 'Oprogramowanie, hosting, licencje na zdjęcia' },
          {
            /**
             * Prowizja potrącana przez zagraniczną platformę to ten sam import
             * usług co subskrypcja narzędzia, ale właściciel apartamentu na
             * doby ani sprzedawca na marketplace nie nazwie jej "narzędziem"
             * ani "reklamą" - bez tej opcji zaznaczyliby "nie kupuję" i moduł
             * VAT-UE nie pojawiłby się w wycenie.
             */
            value: 'prowizje',
            label: 'Prowizje zagranicznych platform',
            hint: 'Booking, Airbnb, marketplace, bramki płatnicze',
          },
          { value: 'reklamy', label: 'Reklamy w serwisach zagranicznych', hint: 'Kampanie w serwisach spoza Polski' },
          { value: 'oba', label: 'Więcej niż jedno z powyższych' },
          {
            value: 'nie-wiem',
            label: 'Jeszcze nie wiem',
            rule: { when: { mode: ['zalozenie'] } },
          },
        ],
      },
    ],
  },

  {
    id: 'skala',
    eyebrow: 'Skala',
    title: 'Skala współpracy',
    intro: 'Te dwie odpowiedzi wystarczą, żeby policzyć wysokość abonamentu.',
    questions: [
      {
        id: 'salesChannels',
        type: 'choice',
        layout: 'pills',
        columns: 2,
        required: true,
        rule: { when: { ecommerce: ['tak'] } },
        label: 'Kanały sprzedaży',
        labelByMode: {
          zalozenie: 'Z ilu miejsc ma wpływać Twoja sprzedaż?',
          przeniesienie: 'Z ilu miejsc wpływa Twoja sprzedaż?',
        },
        help: `Kanał to własny sklep oraz każda platforma, z której wpływa sprzedaż - Allegro, Amazon, Etsy, eBay. Pierwszy jest w cenie pakietu, każdy kolejny to moduł za ${ecommerce.channelRate} zł netto miesięcznie. Dopłata nie zależy od wolumenu, bo każdy kanał ma własny format raportu, własną strukturę prowizji i własny cykl wypłat, więc wymaga osobnego uzgodnienia niezależnie od liczby zamówień.`,
        shortLabel: 'Kanały sprzedaży',
        options: [
          { value: '1', label: 'Jeden', hint: 'W cenie pakietu' },
          { value: '2', label: 'Dwa', hint: `+${ecommerce.channelRate} zł / mies.` },
          { value: '3', label: 'Trzy', hint: `+${ecommerce.channelRate * 2} zł / mies.` },
          { value: '4+', label: 'Cztery i więcej', hint: `od +${ecommerce.channelRate * 3} zł / mies.` },
        ],
      },
      {
        /**
         * Wolumen sprzedaży przeliczamy na dokumenty osobno, bo klient nie ma
         * jak policzyć go sam: sprzedaż wchodzi do ksiąg zbiorczym
         * zestawieniem. Wartość opcji jest górną granicą przedziału, tak samo
         * jak przy pytaniu o dokumenty poniżej.
         */
        id: 'ecomTx',
        type: 'choice',
        layout: 'pills',
        columns: 3,
        required: true,
        rule: { when: { ecommerce: ['tak'] } },
        label: 'Liczba zamówień miesięcznie',
        labelByMode: {
          zalozenie: 'Ile zamówień miesięcznie przewidujesz?',
          przeniesienie: 'Ile zamówień realizujesz miesięcznie?',
        },
        help: `Zestawienie sprzedaży obejmujące do ${ecommerce.txPerDoc} transakcji liczymy jako jeden dokument, a każde rozpoczęte kolejne ${ecommerce.txPerDoc} transakcji jako kolejny. Do transakcji wliczamy sprzedaż razem ze zwrotami i korektami. Tej sprzedaży nie doliczaj do liczby dokumentów w następnym pytaniu - policzymy ją za Ciebie.`,
        shortLabel: 'Zamówienia / mies.',
        options: [
          { value: '100', label: 'do 100' },
          { value: '250', label: '101 - 250' },
          { value: '500', label: '251 - 500' },
          { value: '1000', label: '501 - 1000' },
          { value: '2500', label: '1001 - 2500' },
          { value: '2500+', label: 'powyżej 2500' },
        ],
      },
      {
        id: 'docs',
        type: 'choice',
        layout: 'pills',
        columns: 3,
        required: true,
        lockable: true,
        label: 'Liczba dokumentów miesięcznie',
        labelByMode: {
          zalozenie: 'Ile dokumentów miesięcznie przewidujesz?',
          przeniesienie: 'Ile dokumentów księgujesz miesięcznie?',
        },
        help: 'Dokument to każdy wpis księgowy: faktura sprzedaży lub kosztowa, wyciąg bankowy, lista płac, amortyzacja. Deklaracje wysyłane do urzędów (JPK_V7, ZUS, PIT) nie liczą się do limitu. Jeśli prowadzisz sprzedaż internetową, nie doliczaj tu zamówień ze sklepu ani z platform - te przeliczamy osobno, na podstawie poprzedniego pytania.',
        shortLabel: 'Dokumenty / mies.',
        options: [
          { value: '10', label: 'do 10' },
          { value: '20', label: '11 - 20' },
          { value: '30', label: '21 - 30' },
          { value: '50', label: '31 - 50' },
          { value: '70', label: '51 - 70' },
          { value: '100', label: '71 - 100' },
          { value: '150', label: '101 - 150' },
          { value: '999', label: 'powyżej 150' },
          {
            value: 'nie-wiem',
            label: 'Trudno oszacować',
            rule: { when: { mode: ['zalozenie'] } },
          },
        ],
      },
      {
        id: 'employees',
        type: 'choice',
        layout: 'pills',
        columns: 3,
        required: true,
        label: 'Zatrudnienie',
        labelByMode: {
          zalozenie: 'Czy planujesz zatrudniać?',
          przeniesienie: 'Ile osób zatrudniasz?',
        },
        help: 'Liczą się umowy o pracę, zlecenia i umowy o dzieło.',
        shortLabel: 'Zatrudnienie',
        options: [
          { value: '0', label: 'Bez pracowników' },
          { value: '1-2', label: '1 - 2 osoby' },
          { value: '3-5', label: '3 - 5 osób' },
          { value: '6-10', label: '6 - 10 osób' },
          { value: '11-25', label: '11 - 25 osób' },
          { value: '26+', label: 'powyżej 25 osób' },
          {
            value: 'nie-wiem',
            label: 'Jeszcze nie wiem',
            rule: { when: { mode: ['zalozenie'] } },
          },
        ],
      },
      {
        id: 'payroll',
        type: 'choice',
        layout: 'pills',
        columns: 3,
        required: true,
        // Pytamy dopiero wtedy, gdy wiadomo, że jest kogo obsługiwać. Bez
        // pracowników albo przy niezdecydowanym zatrudnieniu to pytanie nie ma
        // treści - wrócimy do niego w rozmowie.
        rule: { when: { employees: ['1-2', '3-5', '6-10', '11-25', '26+'] } },
        label: 'Kadry i płace',
        labelByMode: {
          zalozenie: 'Czy powierzysz nam kadry i płace?',
          przeniesienie: 'Czy przenosisz do nas także kadry i płace?',
        },
        shortLabel: 'Kadry i płace',
        options: [
          {
            value: 'tak',
            label: 'Tak, pełna obsługa',
            hint: `Listy płac, ZUS, akta osobowe, PIT-11. Od ${bundleDiscount.minEmployees} osób dochodzi rabat ${bundleDiscount.rate * 100}% od łącznej kwoty.`,
          },
          { value: 'oferta', label: 'Chcę poznać ofertę', hint: 'Zdecyduję po zapoznaniu się z wyceną' },
          { value: 'nie', label: 'Nie, kadry zostają u mnie' },
        ],
      },
    ],
  },

  {
    id: 'termin',
    eyebrow: 'Termin',
    title: 'Termin i szczegóły',
    titleByMode: {
      zalozenie: 'Start działalności',
      przeniesienie: 'Przeniesienie księgowości',
    },
    introByMode: {
      zalozenie: 'Ostatnie pytania o formalności - dzięki nim od razu policzymy ZUS i przygotujemy komplet wniosków.',
      przeniesienie: 'Ostatnie pytania o formalności - dzięki nim zaplanujemy przejęcie dokumentów bez przerwy w rozliczeniach.',
    },
    questions: [
      /* ── ścieżka: zakładanie działalności ─────────────────────────────── */
      {
        id: 'startDate',
        type: 'choice',
        layout: 'pills',
        columns: 2,
        required: true,
        rule: { when: { mode: ['zalozenie'] } },
        label: 'Kiedy chcesz rozpocząć działalność?',
        shortLabel: 'Start działalności',
        options: [
          { value: 'asap', label: 'Jak najszybciej' },
          { value: 'miesiac', label: 'W przyszłym miesiącu' },
          { value: 'kwartal', label: 'W ciągu najbliższych 3 miesięcy' },
          { value: 'data', label: 'Mam konkretną datę' },
        ],
      },
      {
        id: 'startDateExact',
        type: 'date',
        attach: true,
        required: true,
        rule: { when: { mode: ['zalozenie'], startDate: ['data'] } },
        label: 'Planowana data rozpoczęcia',
        shortLabel: 'Planowana data startu',
      },
      {
        id: 'registration',
        type: 'choice',
        layout: 'pills',
        columns: 3,
        required: true,
        rule: { when: { mode: ['zalozenie'] } },
        label: 'Czy chcesz pomoc przy rejestracji?',
        shortLabel: 'Pomoc przy rejestracji',
        help: `Spotykamy się online i przechodzimy przez formularz razem: policzone warianty opodatkowania i ZUS, kody PKD, decyzja o VAT, uprawnienia w KSeF. Przy jednoosobowej działalności i spółce cywilnej jest to element umowy o stałą obsługę księgową, więc nie doliczamy za to nic osobno - płatna konsultacja przed założeniem działalności jest dla osób, które nie zdecydowały jeszcze, z kim będą prowadzić księgowość. Wniosek zostaje po Twojej stronie i jest to świadomy wybór, a nie ostrożność - pełnomocnikiem w rejestracji nie jesteśmy. Przy jednoosobowej działalności pełnomocnik i tak nie złoży wniosku CEIDG-1 przez internet, a przy spółce umowę podpisują wszyscy wspólnicy, wniosek o wpis wszyscy członkowie zarządu i przed sądem rejestrowym reprezentować może wyłącznie adwokat albo radca prawny. Aport, nietypowa umowa i formy bez wzorca w S24 wymagają notariusza.`,
        options: [
          { value: 'tak', label: 'Tak, przejdźmy przez to razem', hint: 'Spotkanie online, formularz, ZUS, VAT i KSeF' },
          { value: 'zlozone', label: 'Wniosek jest już złożony' },
          { value: 'sam', label: 'Nie, poradzę sobie sam' },
        ],
      },
      {
        id: 'zusHistory',
        type: 'choice',
        layout: 'pills',
        columns: 3,
        required: true,
        rule: { when: { mode: ['zalozenie'] } },
        label: 'Czy prowadziłeś działalność w ciągu ostatnich 60 miesięcy?',
        help: 'To pytanie decyduje o prawie do ulgi na start i preferencyjnych składek ZUS.',
        shortLabel: 'Działalność w ostatnich 5 latach',
        options: [
          { value: 'nie', label: 'Nie, to moja pierwsza firma' },
          { value: 'tak', label: 'Tak, w ciągu ostatnich 5 lat' },
          { value: 'nie-pamietam', label: 'Nie mam pewności' },
        ],
      },
      {
        id: 'employment',
        type: 'choice',
        layout: 'pills',
        columns: 3,
        required: true,
        rule: { when: { mode: ['zalozenie'] } },
        label: 'Czy masz inny tytuł do ubezpieczeń?',
        help: 'Etat, zlecenie, emerytura lub status studenta zmieniają wysokość składek ZUS z działalności.',
        shortLabel: 'Inny tytuł do ZUS',
        options: [
          { value: 'brak', label: 'Nie, tylko działalność' },
          { value: 'etat', label: 'Umowa o pracę' },
          { value: 'zlecenie', label: 'Umowa zlecenie' },
          { value: 'emerytura', label: 'Emerytura lub renta' },
          { value: 'student', label: 'Student do 26. roku życia' },
        ],
      },

      /* ── ścieżka: przeniesienie księgowości ───────────────────────────── */
      {
        id: 'transferDate',
        type: 'choice',
        layout: 'pills',
        columns: 2,
        required: true,
        rule: { when: { mode: ['przeniesienie'] } },
        label: 'Od kiedy chcesz przenieść księgowość?',
        shortLabel: 'Termin przeniesienia',
        options: [
          { value: 'asap', label: 'Jak najszybciej' },
          { value: 'miesiac', label: 'Od kolejnego miesiąca' },
          { value: 'rok', label: 'Od nowego roku podatkowego' },
          { value: 'data', label: 'Mam konkretny termin' },
        ],
      },
      {
        id: 'transferDateExact',
        type: 'date',
        attach: true,
        required: true,
        rule: { when: { mode: ['przeniesienie'], transferDate: ['data'] } },
        label: 'Planowana data przejęcia',
        shortLabel: 'Planowana data przejęcia',
      },
      {
        id: 'currentProvider',
        type: 'choice',
        layout: 'pills',
        columns: 2,
        required: true,
        rule: { when: { mode: ['przeniesienie'] } },
        label: 'Kto prowadzi dziś Twoją księgowość?',
        shortLabel: 'Obecna księgowość',
        options: [
          { value: 'biuro', label: 'Biuro rachunkowe' },
          { value: 'ksiegowa', label: 'Księgowa zatrudniona w firmie' },
          { value: 'samodzielnie', label: 'Prowadzę ją samodzielnie' },
          { value: 'inne', label: 'Inaczej' },
        ],
      },
      {
        id: 'reason',
        type: 'multi',
        layout: 'chips',
        required: true,
        max: 3,
        rule: { when: { mode: ['przeniesienie'] } },
        label: 'Co skłania Cię do zmiany?',
        help: 'Wskaż do trzech najważniejszych powodów - od nich zaczniemy rozmowę.',
        shortLabel: 'Powód zmiany',
        options: [
          { value: 'cena', label: 'Cena obsługi' },
          { value: 'bledy', label: 'Błędy i korekty' },
          { value: 'komunikacja', label: 'Słaba komunikacja' },
          { value: 'doradztwo', label: 'Brak doradztwa podatkowego' },
          { value: 'technologia', label: 'Brak KSeF, OCR i portalu' },
          { value: 'terminy', label: 'Nieterminowość' },
          { value: 'rozwoj', label: 'Zmiana skali firmy' },
          { value: 'zakonczenie', label: 'Biuro kończy współpracę' },
          { value: 'inne', label: 'Inny powód' },
        ],
      },
      {
        id: 'reasonOther',
        type: 'text',
        attach: true,
        rule: { when: { mode: ['przeniesienie'], reason: ['inne'] } },
        label: 'Napisz, co jest dla Ciebie najważniejsze',
        shortLabel: 'Powód zmiany (opis)',
        placeholder: 'Nieobowiązkowe, ale bardzo nam pomoże',
        maxlength: 200,
      },
      {
        /**
         * Zawieszenie w trakcie roku zmienia to, czego przy przejęciu mamy
         * szukać. Za pełne miesiące zawieszenia nie składa się JPK_V7 ani
         * zaliczek, ale rok domyka jedno zeznanie, a zapisy sprzed przerwy
         * muszą zgadzać się z tymi po wznowieniu. Bez tej odpowiedzi brak
         * dokumentów za część roku wygląda przy przejęciu na zaległość i
         * pierwsza rozmowa zaczyna się od wyjaśniania nieporozumienia.
         *
         * Pytamy wyłącznie przy przeniesieniu księgowości i tylko w formach
         * prawnych, w których zawieszenie w ogóle wchodzi w grę
         * (SUSPENDABLE_FORMS). Firma zakładana dopiero teraz nie miała jeszcze
         * jak zrobić sobie przerwy.
         */
        id: 'suspension',
        type: 'choice',
        layout: 'pills',
        columns: 3,
        required: true,
        rule: { when: { mode: ['przeniesienie'], legalForm: SUSPENDABLE_FORMS } },
        label: 'Czy w tym roku była przerwa w prowadzeniu działalności?',
        help: 'Chodzi o zawieszenie zgłoszone w CEIDG albo w KRS, a nie o urlop czy przestój. Miesiące zawieszenia nie mają rozliczeń miesięcznych, ale rok i tak trzeba zamknąć jednym zeznaniem - dzięki tej odpowiedzi wiemy, za które miesiące dokumenty w ogóle powinny być, i nie policzymy ich braku jako zaległości.',
        shortLabel: 'Przerwa w działalności',
        options: [
          { value: 'nie', label: 'Nie, firma działała cały rok' },
          {
            value: 'wznowiona',
            label: 'Tak, była zawieszona i już wznowiona',
            hint: 'Rok dzieli się na okresy przed przerwą i po niej',
          },
          {
            value: 'trwa',
            label: 'Tak, jest zawieszona do dziś',
            hint: 'Przejmiemy dokumentację i przygotujemy się do wznowienia',
          },
        ],
      },
      {
        id: 'docsState',
        type: 'choice',
        layout: 'pills',
        columns: 2,
        required: true,
        rule: { when: { mode: ['przeniesienie'] } },
        label: 'Jak wygląda stan dokumentacji?',
        help: 'Przejęcie uporządkowanych ksiąg w trakcie roku jest u nas bezpłatne.',
        shortLabel: 'Stan dokumentacji',
        options: [
          { value: 'biezaco', label: 'Wszystko na bieżąco' },
          { value: 'drobne', label: 'Drobne zaległości, do miesiąca' },
          { value: 'zaleglosci', label: 'Zaległości powyżej miesiąca' },
          { value: 'odtworzenie', label: 'Księgi wymagają odtworzenia' },
        ],
      },
      {
        /**
         * Odtworzenie ksiąg wyceniamy indywidualnie, więc bez opisu wycena
         * kończy się na "wycena indywidualna", a pierwsza rozmowa zaczyna się
         * od zera. Pytamy o dwie rzeczy naraz, bo dopiero razem mówią, ile tu
         * pracy: skąd wziął się taki stan (poprzednie biuro przestało
         * odpowiadać, dokumenty przepadły, firma rozliczała się sama) i co
         * trzeba odtworzyć - same zapisy w księdze czy również dokumenty
         * źródłowe i deklaracje.
         */
        id: 'docsStateDetails',
        type: 'textarea',
        attach: true,
        required: true,
        rows: 4,
        maxlength: 600,
        rule: { when: { mode: ['przeniesienie'], docsState: ['odtworzenie'] } },
        label: 'Co trzeba odtworzyć i skąd wziął się taki stan?',
        help: 'Napisz, od którego miesiąca nie ma zapisów, czy masz komplet dokumentów źródłowych i czy któreś deklaracje nie zostały złożone. Im konkretniej, tym mniej pytań na konsultacji.',
        shortLabel: 'Księgi do odtworzenia (opis)',
        placeholder: 'np. poprzednie biuro przestało odpowiadać w maju, od czerwca nie ma zapisów w KPiR ani wysłanych JPK_V7 - faktury mam komplet, brakuje wyciągów za dwa miesiące',
      },
      {
        id: 'handover',
        type: 'choice',
        layout: 'pills',
        columns: 3,
        required: true,
        rule: { when: { mode: ['przeniesienie'], currentProvider: ['biuro'] } },
        label: 'Czy pomóc w rozstaniu z obecnym biurem?',
        shortLabel: 'Pomoc przy wypowiedzeniu',
        options: [
          { value: 'tak', label: 'Tak, przejmijcie formalności', hint: 'Wypowiedzenie, pełnomocnictwa, odbiór dokumentów' },
          { value: 'wskazowki', label: 'Wystarczą wskazówki' },
          { value: 'nie', label: 'Mam to już załatwione' },
        ],
      },
    ],
  },

  {
    id: 'kontakt',
    eyebrow: 'Kontakt',
    title: 'Gdzie wysłać wycenę?',
    intro: 'Przygotujemy indywidualną wycenę i plan wdrożenia.',
    questions: [
      {
        id: 'firstName',
        type: 'text',
        half: true,
        required: true,
        label: 'Imię',
        shortLabel: 'Imię',
        autocomplete: 'given-name',
        maxlength: 60,
      },
      {
        id: 'lastName',
        type: 'text',
        half: true,
        required: true,
        label: 'Nazwisko',
        shortLabel: 'Nazwisko',
        autocomplete: 'family-name',
        maxlength: 60,
      },
      {
        id: 'email',
        type: 'email',
        half: true,
        required: true,
        validate: 'email',
        label: 'Adres e-mail',
        shortLabel: 'E-mail',
        placeholder: 'jan@twojafirma.pl',
        autocomplete: 'email',
        inputmode: 'email',
        maxlength: 120,
      },
      {
        id: 'phone',
        type: 'tel',
        half: true,
        validate: 'phone',
        label: 'Telefon',
        help: 'Nieobowiązkowo - zadzwonimy tylko wtedy, gdy o to poprosisz.',
        shortLabel: 'Telefon',
        placeholder: '+48 600 100 200',
        autocomplete: 'tel',
        inputmode: 'tel',
        maxlength: 24,
      },
      {
        id: 'company',
        type: 'text',
        half: true,
        requiredWhen: { when: { mode: ['przeniesienie'] } },
        label: 'Nazwa firmy',
        labelByMode: {
          zalozenie: 'Planowana nazwa firmy',
          przeniesienie: 'Nazwa firmy',
        },
        helpByMode: { zalozenie: 'Jeśli jeszcze jej nie masz, zostaw puste.' },
        shortLabel: 'Firma',
        autocomplete: 'organization',
        maxlength: 160,
      },
      {
        id: 'nip',
        type: 'text',
        half: true,
        validate: 'nip',
        rule: { when: { mode: ['przeniesienie'] } },
        label: 'NIP',
        help: 'Nieobowiązkowo. Przyspieszy weryfikację danych w rejestrach.',
        shortLabel: 'NIP',
        placeholder: '1234567890',
        inputmode: 'numeric',
        maxlength: 15,
      },
      {
        id: 'contactPreference',
        type: 'choice',
        layout: 'pills',
        columns: 3,
        required: true,
        label: 'Jak wolisz się kontaktować?',
        shortLabel: 'Preferowany kontakt',
        options: [
          { value: 'email', label: 'E-mail', hint: 'Wycena i plan na piśmie' },
          { value: 'telefon', label: 'Telefon' },
          { value: 'video', label: 'Wideorozmowa', hint: 'Bezpłatna rozmowa wstępna' },
        ],
      },
      {
        id: 'notes',
        type: 'textarea',
        rows: 4,
        maxlength: 2000,
        label: 'Coś jeszcze, co powinniśmy wiedzieć?',
        shortLabel: 'Uwagi',
        placeholderByMode: {
          zalozenie: 'np. planuję ulgę IP Box, będę kupować sprzęt na firmę, mam wspólnika',
          przeniesienie: 'np. mam nierozliczoną kontrolę, korzystam z IP Box, wystawiam faktury walutowe',
        },
        placeholder: 'Nieobowiązkowe - każdy szczegół pomaga nam przygotować trafniejszą wycenę.',
      },
      {
        id: 'referral',
        type: 'text',
        collapsible: 'Mam kod polecający',
        label: 'Kod polecający',
        shortLabel: 'Kod polecający',
        placeholder: 'np. TAXUN-2026',
        maxlength: 40,
      },
    ],
  },
];

/** Szybki dostęp do pytania po identyfikatorze - używane przy renderowaniu maila. */
export const questionsById: Record<string, Question> = Object.fromEntries(
  steps.flatMap((s) => s.questions.map((q) => [q.id, q]))
);

export const modeLabels: Record<Mode, string> = {
  zalozenie: 'Założenie działalności',
  przeniesienie: 'Przeniesienie księgowości',
};

/** Pola ustawiane z adresu URL, nie z odpowiedzi użytkownika. */
export const META_FIELDS = ['planTable', 'planDocs'] as const;
