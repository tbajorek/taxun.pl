/**
 * Logika kreatora wyceny - wspólna dla przeglądarki i serwera.
 *
 * Ten sam kod decyduje o tym, które pytanie widzi użytkownik, i o tym, jak
 * odpowiedź zostaje opisana w wiadomości e-mail. Dzięki temu w mailu nigdy nie
 * pojawi się odpowiedź na pytanie, którego formularz nie zadał (np. forma
 * opodatkowania KPiR przy spółce z o.o.).
 */

import {
  bundleDiscount,
  currencyInvoices,
  ecommerce,
  foreignTax,
  hrMin,
  hrStandard,
  ipBox,
  ossFees,
  personalReturns,
  setupFees,
  tables,
  wis,
  type DocBucket,
  type PricingTable,
} from '../data/pricing';
import {
  META_FIELDS,
  modeLabels,
  questionsById,
  steps,
  VAT_EXCLUDED_GOODS,
  type Answers,
  type AnswerValue,
  type Mode,
  type Question,
  type Rule,
  type Step,
  type WizardOption,
} from '../data/wizard';

export { steps, questionsById, modeLabels };
export type { Answers, AnswerValue, Mode, Question, Step, WizardOption };

/* ── Reguły widoczności ──────────────────────────────────────────────────── */

const has = (answers: Answers, key: string, list: string[]): boolean => {
  const v = answers[key];
  if (Array.isArray(v)) return v.some((x) => list.includes(x));
  return typeof v === 'string' && v !== '' && list.includes(v);
};

export function matchRule(rule: Rule | undefined, answers: Answers): boolean {
  if (!rule) return true;
  if (rule.when) {
    for (const [key, list] of Object.entries(rule.when)) {
      if (!has(answers, key, list)) return false;
    }
  }
  if (rule.unless) {
    for (const [key, list] of Object.entries(rule.unless)) {
      if (has(answers, key, list)) return false;
    }
  }
  return true;
}

/**
 * Opcje dostępne przy obecnych odpowiedziach.
 *
 * Pakiet wybrany w cenniku (`planTable`) zawęża listę, żeby nie pytać drugi raz
 * o to samo. Gdyby jednak to zawężenie nie zostawiło żadnej opcji - np. ktoś
 * wszedł z linku do ryczałtu, a potem wskazał spółkę z o.o. - pakiet
 * ignorujemy. Lepiej zadać pytanie jeszcze raz niż pokazać pusty krok.
 */
export function visibleOptions(question: Question, answers: Answers): WizardOption[] {
  const all = question.options ?? [];
  const matched = all.filter((o) => matchRule(o.rule, answers));
  if (matched.length > 0 || !answers.planTable) return matched;
  const withoutPlan: Answers = { ...answers, planTable: '' };
  return all.filter((o) => matchRule(o.rule, withoutPlan));
}

/**
 * Czy pakiet z cennika nadal pasuje do odpowiedzi.
 *
 * Gdy przestaje pasować - ktoś wszedł z linku do ryczałtu, a potem wskazał
 * spółkę z o.o. - trzeba zdjąć blokady i zapytać o formę rozliczenia jeszcze
 * raz. Dopóki forma prawna nie jest wybrana, żadna forma opodatkowania nie
 * pasuje i to nie jest powód do kasowania pakietu.
 */
export function planStillFits(answers: Answers): boolean {
  if (!answers.planTable || !answers.legalForm) return true;
  return (questionsById.taxForm.options ?? []).some((o) => matchRule(o.rule, answers));
}

export function isVisible(question: Question, answers: Answers, locks: Set<string> = new Set()): boolean {
  if (locks.has(question.id)) return false;
  if (!matchRule(question.rule, answers)) return false;
  if (question.options) {
    const opts = visibleOptions(question, answers);
    if (opts.length === 0) return false;
    // Jedna możliwa odpowiedź to nie jest pytanie - zaznaczamy ją automatycznie.
    if (question.autoSelectSingle && opts.length === 1) return false;
  }
  return true;
}

export function isRequired(question: Question, answers: Answers): boolean {
  if (question.required) return true;
  if (question.requiredWhen) return matchRule(question.requiredWhen, answers);
  return false;
}

export function visibleQuestions(step: Step, answers: Answers, locks?: Set<string>): Question[] {
  return step.questions.filter((q) => isVisible(q, answers, locks));
}

/* ── Etykiety zależne od ścieżki ─────────────────────────────────────────── */

const byMode = <T,>(base: T, map: Partial<Record<Mode, T>> | undefined, answers: Answers): T => {
  const mode = answers.mode as Mode | undefined;
  if (mode && map && map[mode] !== undefined) return map[mode] as T;
  return base;
};

export const questionLabel = (q: Question, answers: Answers) => byMode(q.label, q.labelByMode, answers);
export const questionHelp = (q: Question, answers: Answers) => byMode(q.help, q.helpByMode, answers);
export const questionPlaceholder = (q: Question, answers: Answers) =>
  byMode(q.placeholder, q.placeholderByMode, answers);
export const stepTitle = (s: Step, answers: Answers) => byMode(s.title, s.titleByMode, answers);
export const stepIntro = (s: Step, answers: Answers) => byMode(s.intro, s.introByMode, answers);

/* ── Walidacja ───────────────────────────────────────────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+()\d][\d\s()./-]{6,}$/;

/** Suma kontrolna polskiego NIP-u (wagi 6,5,7,2,3,4,5,6,7 modulo 11). */
export function isValidNip(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 10) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const check = sum % 11;
  return check !== 10 && check === Number(digits[9]);
}

const asText = (value: AnswerValue | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

/** Zwraca komunikat błędu albo null, gdy odpowiedź jest poprawna. */
export function validateAnswer(q: Question, answers: Answers): string | null {
  const value = answers[q.id];
  const required = isRequired(q, answers);

  if (q.type === 'multi') {
    const picked = Array.isArray(value) ? value : [];
    if (required && picked.length === 0) return 'Wybierz co najmniej jedną odpowiedź.';
    if (q.max && picked.length > q.max) return `Wybierz maksymalnie ${q.max} odpowiedzi.`;
    return null;
  }

  const text = asText(value);
  if (!text) return required ? requiredMessage(q) : null;

  if (q.type === 'choice') {
    const allowed = visibleOptions(q, answers).map((o) => o.value);
    if (!allowed.includes(text)) return requiredMessage(q);
    return null;
  }
  if (q.validate === 'email' && !EMAIL_RE.test(text)) return 'Podaj poprawny adres e-mail, np. jan@twojafirma.pl.';
  if (q.validate === 'phone' && !PHONE_RE.test(text)) return 'Numer telefonu wygląda na niekompletny.';
  if (q.validate === 'nip' && !isValidNip(text)) return 'NIP składa się z 10 cyfr - sprawdź, czy nie ma literówki.';
  if (q.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(text)) return 'Wybierz datę z kalendarza.';
  if (q.maxlength && text.length > q.maxlength) return `Maksymalna długość to ${q.maxlength} znaków.`;
  return null;
}

function requiredMessage(q: Question): string {
  if (q.type === 'choice') return 'Wybierz jedną z odpowiedzi, aby przejść dalej.';
  if (q.type === 'date') return 'Wybierz datę.';
  return 'To pole jest wymagane.';
}

/** Wszystkie błędy widocznych pytań danego kroku. */
export function validateStep(step: Step, answers: Answers, locks?: Set<string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const q of visibleQuestions(step, answers, locks)) {
    const error = validateAnswer(q, answers);
    if (error) errors[q.id] = error;
  }
  return errors;
}

/* ── Uzgadnianie stanu odpowiedzi ────────────────────────────────────────────
   Odpowiedzi zależą od siebie nawzajem: forma prawna decyduje o dostępnych
   formach opodatkowania, te o rodzaju ksiąg, zatrudnienie o pytaniu o kadry.
   Po każdej zmianie trzeba przejść cały graf, bo jedna poprawka pociąga
   kolejne. Ten sam kod działa w przeglądarce i w testach.
   ────────────────────────────────────────────────────────────────────────── */

export type WizardState = {
  answers: Answers;
  /** Pytania wypełnione linkiem z cennika - nie zadajemy ich po raz drugi. */
  locks: Set<string>;
  /** Odpowiedzi z linku czekające, aż ich pytanie stanie się widoczne. */
  pending: Map<string, string>;
};

export const createState = (answers: Answers = {}): WizardState => ({
  answers,
  locks: new Set(),
  pending: new Map(),
});

export const cloneState = (state: WizardState): WizardState => ({
  answers: JSON.parse(JSON.stringify(state.answers)) as Answers,
  locks: new Set(state.locks),
  pending: new Map(state.pending),
});

const allQuestions = (): Question[] => steps.flatMap((s) => s.questions);

/**
 * Kasuje odpowiedzi, które przestały mieć sens: na pytania ukryte przez
 * reguły oraz wskazujące na opcję niedostępną po zmianie wcześniejszych
 * wyborów. Dzięki temu do maila nie trafi np. KPiR przy spółce z o.o.
 */
function prune(state: WizardState): boolean {
  const { answers } = state;
  let changed = false;
  for (const q of allQuestions()) {
    if (!matchRule(q.rule, answers)) {
      if (answers[q.id] !== undefined) {
        delete answers[q.id];
        state.locks.delete(q.id);
        changed = true;
      }
      continue;
    }
    if (!q.options) continue;
    const allowed = new Set(visibleOptions(q, answers).map((o) => o.value));
    const value = answers[q.id];
    if (Array.isArray(value)) {
      const kept = value.filter((v) => allowed.has(v));
      if (kept.length !== value.length) {
        if (kept.length) answers[q.id] = kept;
        else delete answers[q.id];
        changed = true;
      }
    } else if (typeof value === 'string' && value && !allowed.has(value)) {
      delete answers[q.id];
      state.locks.delete(q.id);
      changed = true;
    }
  }
  return changed;
}

/** Wstawia odłożone odpowiedzi z linku, gdy ich pytania są już widoczne. */
function applyPending(state: WizardState): boolean {
  let changed = false;
  for (const [id, value] of Array.from(state.pending)) {
    const q = questionsById[id];
    if (!q) {
      state.pending.delete(id);
      continue;
    }
    if (!matchRule(q.rule, state.answers)) continue;
    const allowed = visibleOptions(q, state.answers).map((o) => o.value);
    if (state.answers[id] === undefined && (!q.options || allowed.includes(value))) {
      state.answers[id] = value;
      changed = true;
    }
    state.pending.delete(id);
  }
  return changed;
}

/** Pytanie z jedną możliwą odpowiedzią zaznaczamy sami i nie pokazujemy go. */
function autoSelect(state: WizardState): boolean {
  let changed = false;
  for (const q of allQuestions()) {
    if (!q.options) continue;
    if (!q.autoSelectSingle && !q.defaultToFirstOption) continue;
    if (!matchRule(q.rule, state.answers)) continue;
    const opts = visibleOptions(q, state.answers);
    if (!opts.length) continue;
    // autoSelectSingle - jedyna sensowna opcja, więc wybieramy ją za użytkownika.
    if (q.autoSelectSingle && opts.length === 1 && state.answers[q.id] !== opts[0].value) {
      state.answers[q.id] = opts[0].value;
      changed = true;
    }
    // defaultToFirstOption - tylko gdy nic jeszcze nie wybrano; późniejszy
    // wybór użytkownika zostaje nietknięty.
    if (q.defaultToFirstOption && state.answers[q.id] === undefined) {
      state.answers[q.id] = opts[0].value;
      changed = true;
    }
  }
  return changed;
}

/** Zdejmuje pakiet z cennika razem z blokadami, które z niego wynikały. */
export function dropPlan(state: WizardState): void {
  delete state.answers.planTable;
  delete state.answers.planDocs;
  state.locks.clear();
}

/**
 * Doprowadza stan do spójności po zmianie dowolnej odpowiedzi. Powtarzamy
 * przebiegi, bo skasowanie jednej odpowiedzi może unieważnić kolejną.
 */
export function reconcile(state: WizardState): void {
  for (let pass = 0; pass < 8; pass += 1) {
    let changed = prune(state);
    if (applyPending(state)) changed = true;
    if (autoSelect(state)) changed = true;
    if (!planStillFits(state.answers)) {
      dropPlan(state);
      changed = true;
    }
    if (!changed) break;
  }
}

/**
 * Odsłania pytanie ukryte przed użytkownikiem - zdejmuje blokadę z linku,
 * a gdy to nie wystarczy, także zawężenie wynikające z pakietu z cennika.
 * Bez tego przycisk "Zmień" w podsumowaniu prowadziłby do pustego kroku.
 */
export function revealQuestion(id: string, state: WizardState): boolean {
  const q = questionsById[id];
  if (!q) return false;
  state.locks.delete(id);
  reconcile(state);
  if (isVisible(q, state.answers, state.locks)) return true;
  dropPlan(state);
  reconcile(state);
  return isVisible(q, state.answers, state.locks);
}

/**
 * Pola wypełnione pakietem z cennika: jawne blokady (liczba dokumentów, VAT)
 * oraz formę opodatkowania, gdy zawężenie zostawiło jedyną możliwość i pytanie
 * nie trafiło na ekran. Użytkownik musi widzieć, skąd wzięła się odpowiedź,
 * której nie wybierał.
 */
export function planFilledFields(state: WizardState): string[] {
  const filled = [...state.locks];
  if (!state.answers.planTable) return filled;
  const q = questionsById.taxForm;
  const hiddenButAnswered =
    state.answers.taxForm !== undefined &&
    matchRule(q.rule, state.answers) &&
    !isVisible(q, state.answers, state.locks);
  if (hiddenButAnswered) filled.push('taxForm');
  return filled;
}

/** Czy da się pytanie odsłonić - sprawdzane na kopii, bez zmiany stanu. */
export const canReveal = (id: string, state: WizardState): boolean =>
  revealQuestion(id, cloneState(state));

/* ── Szacunkowa wycena na podstawie cennika ──────────────────────────────── */

/**
 * Najniższa stawka z całego cennika. Pokazujemy ją jako "od X zł", zanim
 * poznamy formę rozliczenia. Liczona z danych, żeby zmiana ceny w
 * `src/data/pricing.ts` wystarczyła do zaktualizowania także kreatora.
 */
export const startingPrice = Math.min(...tables.map((t) => t.startsFrom));

export type EstimateLine = {
  id: string;
  label: string;
  /** Kwota netto; 'custom' oznacza wycenę indywidualną. */
  amount: number | 'custom';
  /** true, gdy kwota jest dolną granicą wybranego przedziału. */
  from?: boolean;
  /** Pozycja pokazywana informacyjnie, poza sumą. */
  optional?: boolean;
  /** Jak często wraca pozycja spoza abonamentu. Domyślnie jednorazowo. */
  period?: 'once' | 'year';
  /**
   * Moduł specjalny, czyli dopłata niezależna od liczby dokumentów - włącza ją
   * konkretna procedura, a nie wolumen. Pokazujemy je w osobnej grupie, żeby
   * było widać, ile kosztuje sam pakiet oparty o dokumenty, a ile obowiązki,
   * które klient może w każdej chwili wyłączyć razem z procedurą.
   */
  module?: boolean;
  note?: string;
};

export type Estimate = {
  /** Tabela z cennika, gdy forma rozliczenia jest już przesądzona. */
  table: PricingTable | null;
  /** Formy rozliczenia, które przy obecnych odpowiedziach wciąż wchodzą w grę. */
  tableOptions: PricingTable[];
  /** true, gdy forma jest jedna; false, gdy kwota jest dolną granicą z kilku form. */
  tableSettled: boolean;
  /** Nazwa pakietu do opisu wyceny - forma albo informacja, że jej nie znamy. */
  tableLabel: string;
  /** Zakres dokumentów z cennika, do którego trafiliśmy. */
  bucketRange: string | null;
  vatLabel: string | null;
  /** Pozycje abonamentu miesięcznego, łącznie z rabatem. */
  monthly: EstimateLine[];
  /** Opłaty jednorazowe, np. rejestracja firmy. */
  once: EstimateLine[];
  /** Suma miesięczna po rabacie. */
  monthlyTotal: number | 'custom' | null;
  /** Suma opłat płatnych raz - bez pozycji wracających co roku. */
  onceTotal: number | 'custom' | null;
  /** true, gdy suma jest kwotą "od", a nie dokładną stawką. */
  isFrom: boolean;
  /**
   * Rozbicie liczby dokumentów przy sprzedaży internetowej. Klient deklaruje
   * tylko dokumenty spoza sprzedaży (faktury kosztowe, wyciągi), a sprzedaż z
   * platform doliczamy przelicznikiem - bez tego rozbicia liczba dokumentów w
   * wiadomości wyglądałaby na wziętą z sufitu.
   */
  ecommerce: EcommerceBreakdown | null;
};

export type EcommerceBreakdown = {
  /** Dokumenty zadeklarowane przez klienta (górna granica wybranego przedziału). */
  declaredDocs: number | null;
  /** Dokumenty wynikające z przeliczenia zestawień sprzedaży. */
  salesDocs: number | null;
  /** Suma, na podstawie której dobraliśmy przedział z cennika. */
  totalDocs: number | null;
  /** Górna granica przedziału transakcji wskazanego przez klienta. */
  transactions: number | null;
  channels: number | null;
  /** Asortyment wyklucza zwolnienie z VAT, więc liczymy stawkę dla czynnego podatnika. */
  vatForced: boolean;
  /** Klient przechowuje towar poza Polską albo tego nie wie. */
  warehouseAbroad: boolean;
};

/** Która tabela z cennika odpowiada danej formie opodatkowania. */
const TABLE_BY_TAX_FORM: Record<string, PricingTable['id']> = {
  ryczalt: 'ryczalt',
  karta: 'ryczalt',
  skala: 'kpir',
  liniowy: 'kpir',
  cit: 'fk',
  'cit-estonski': 'fk',
};

/** Forma opodatkowania i forma prawna wskazują tabelę z cennika. */
export function derivedTableId(answers: Answers): PricingTable['id'] | null {
  const legalForm = asText(answers.legalForm);
  if (legalForm === 'zoo' || legalForm === 'komandytowa') return 'fk';
  const byTaxForm = TABLE_BY_TAX_FORM[asText(answers.taxForm)];
  if (byTaxForm) return byTaxForm;
  const plan = asText(answers.planTable) as PricingTable['id'] | '';
  return plan || null;
}

/**
 * Formy rozliczenia, które przy obecnych odpowiedziach wciąż wchodzą w grę.
 *
 * Klient może odpowiedzieć "nie wiem, potrzebuję rekomendacji" i to jest
 * odpowiedź poprawna, z którą przechodzi cały formularz do końca. Wycena nie
 * może wtedy zostać bez pakietu: liczba dokumentów jest znana, więc znana jest
 * też najniższa kwota, jaką klient zapłaci niezależnie od tego, którą formę
 * ostatecznie wybierze. Bierzemy ją z opcji, które pytanie o formę
 * opodatkowania nadal pokazuje - dzięki temu wyliczenie samo respektuje
 * wykluczenia (praca dla byłego pracodawcy odbiera ryczałt) i nie trzeba ich
 * powtarzać drugi raz tutaj.
 */
export function candidateTables(answers: Answers): PricingTable[] {
  const settled = derivedTableId(answers);
  if (settled) return tables.filter((t) => t.id === settled);
  const ids = new Set<PricingTable['id']>();
  for (const option of visibleOptions(questionsById.taxForm, answers)) {
    const id = TABLE_BY_TAX_FORM[option.value];
    if (id) ids.add(id);
  }
  // Forma prawna jeszcze nie wybrana ("jeszcze nie wiem") - żadna forma
  // opodatkowania nie jest wykluczona, więc w grę wchodzi cały cennik.
  return ids.size ? tables.filter((t) => ids.has(t.id)) : [...tables];
}

/**
 * Formy prawne, dla których Ministerstwo Sprawiedliwości udostępnia wzorzec
 * umowy w S24. Poza tą listą wzorca nie ma, więc umowa wymaga notariusza
 * i przygotowania dokumentów w systemie nie oferujemy.
 */
const S24_LEGAL_FORMS = ['zoo', 'jawna', 'komandytowa'];

/** Dolne granice przedziałów - szacujemy defensywnie, nie zawyżając kwoty. */
const PEOPLE_FLOOR: Record<string, number> = { '1-2': 1, '3-5': 3, '6-10': 6, '11-25': 11, '26+': 26 };

const sumLines = (lines: EstimateLine[]): number =>
  lines.reduce((acc, l) => (l.optional || typeof l.amount !== 'number' ? acc : acc + l.amount), 0);

export function estimate(answers: Answers): Estimate {
  const table = tables.find((t) => t.id === derivedTableId(answers)) ?? null;
  const tableOptions = table ? [table] : candidateTables(answers);
  const monthly: EstimateLine[] = [];
  const once: EstimateLine[] = [];

  /* ── Rejestracja firmy ──────────────────────────────────────────────── */
  // Liczymy ją jako pierwszą, żeby w podsumowaniu stała na czele opłat
  // jednorazowych: kto zakłada firmę, przychodzi po rejestrację, a usługi
  // dodatkowe i pozycje do potwierdzenia są dla niego dalszym planem.
  //
  // To konsultacja, nie rejestracja wykonana za klienta - ani przy CEIDG, ani
  // przy KRS nie jesteśmy pełnomocnikiem (dlaczego, patrz komentarz przy
  // `setupFees`). Etykieta i nota muszą to nieść same, bo w wiadomości do
  // biura i w bocznym panelu widać tylko je.
  //
  // Przy jednoosobowej działalności i spółce cywilnej kwota jest zerowa i to
  // nie jest gest handlowy, tylko konsekwencja procedury: kto wypełnia kreator,
  // pyta o stałą obsługę, a przy umowie o obsługę pomoc przy założeniu firmy
  // jest jej elementem. Płatna konsultacja za `setupFees.jdg` zostaje osobnym
  // produktem dla osoby, która nie zdecydowała jeszcze, z kim będzie prowadzić
  // księgowość - tej ścieżki kreator nie wycenia, bo ona nie prowadzi do
  // abonamentu.
  //
  // Przy spółce rejestrowanej w S24 kwota jest realna: przejście przez wzorzec
  // umowy, kapitał, udziały i wybór CIT to praca poprzedzająca powstanie spółki
  // i wykonujemy ją niezależnie od tego, czy dojdzie do stałej współpracy.
  // Przy umowie o obsługę w ciągu `creditWithinDays` dni odejmujemy ją od
  // pierwszej faktury i o tym mówi nota.
  //
  // Formy spoza listy S24 (`inne` - akcyjna, partnerska, fundacja) nie mają
  // w systemie wzorca, a `nie-wiem` nie wskazuje jeszcze żadnej procedury.
  // W obu przypadkach nie wystawiamy pozycji: zakres ustala biuro po
  // przeczytaniu zgłoszenia.
  if (asText(answers.mode) === 'zalozenie' && asText(answers.registration) === 'tak') {
    const legalForm = asText(answers.legalForm);
    if (legalForm === 'jdg' || legalForm === 'sc') {
      once.push({
        id: 'setup',
        label: 'Pomoc przy założeniu firmy',
        amount: 0,
        note: 'W cenie umowy o stałą obsługę księgową. Wniosek CEIDG-1 podpisujesz i wysyłasz sam - pełnomocnik nie złoży go przez internet.',
      });
    } else if (S24_LEGAL_FORMS.includes(legalForm)) {
      once.push({
        id: 'setup',
        label: 'Konsultacja przed założeniem spółki',
        amount: setupFees.s24,
        note: `Odejmujemy ją od pierwszej faktury, jeśli w ciągu ${setupFees.creditWithinDays} dni wejdzie w życie umowa o obsługę. Umowę spółki i wniosek o wpis podpisują oraz składają wspólnicy i zarząd.`,
      });
    }
  }

  /* ── Sprzedaż internetowa ───────────────────────────────────────────── */
  // Liczymy to przed księgowością, bo przelicznik zestawień sprzedaży zmienia
  // liczbę dokumentów, a asortyment potrafi wymusić kolumnę "z VAT".
  const isEcommerce = asText(answers.ecommerce) === 'tak';
  const goods = Array.isArray(answers.ecomGoods) ? answers.ecomGoods : [];
  const vatForced = isEcommerce && goods.some((g) => VAT_EXCLUDED_GOODS.includes(g));

  const txAnswer = isEcommerce ? asText(answers.ecomTx) : '';
  // Ostatnia pozycja jest otwarta ("2500+"). Przy takim wolumenie różnice
  // między klientami są zbyt duże, żeby podawać kwotę z cennika.
  const txOpenEnded = txAnswer.endsWith('+');
  const transactions = txAnswer && !txOpenEnded ? Number.parseInt(txAnswer, 10) : null;
  const salesDocs = transactions !== null ? Math.ceil(transactions / ecommerce.txPerDoc) : null;

  const channelsAnswer = isEcommerce ? asText(answers.salesChannels) : '';
  const channelsOpenEnded = channelsAnswer.endsWith('+');
  const channels = channelsAnswer ? Number.parseInt(channelsAnswer, 10) : null;

  /* ── Księgowość ─────────────────────────────────────────────────────── */
  // Pakiet wyceniamy liczbą dokumentów. Gdy forma rozliczenia nie jest jeszcze
  // przesądzona, liczymy najtańszy wariant z form, które wchodzą w grę, i
  // oznaczamy kwotę jako "od". Wcześniej wycena zostawała wtedy bez pakietu, a
  // kreator pokazywał najniższą stawkę z całego cennika - czyli cenę za
  // dziesięć dokumentów komuś, kto zadeklarował sto pięćdziesiąt.
  // Kolumna cennika zależy od statusu VAT. Dopóki klient o nim nie odpowiedział,
  // bierzemy tańszą - kwota "od" ma być dolną granicą, a nie zgadywaniem. Gdy
  // odpowiedział "nie wiem, doradźcie mi", liczymy wariant dla czynnego
  // podatnika i mówimy o tym w notatce: to droższa z dwóch dróg, więc po
  // rozstrzygnięciu kwota może już tylko spaść.
  const vatAnswer = vatForced ? 'czynny' : asText(answers.vat);
  const vatFree = vatAnswer === '' || vatAnswer === 'zwolniony';
  const rateOf = (t: PricingTable, b: DocBucket) => (t.hasVat ? (vatFree ? b.noVat : b.withVat) : b.price);

  const docs = asText(answers.docs);
  const declaredDocs = docs && docs !== 'nie-wiem' ? Number(docs) : null;
  // Dokumenty zadeklarowane przez klienta obejmują faktury kosztowe i wyciągi.
  // Sprzedaż z platform dochodzi do nich osobno, po przeliczniku. Przy
  // otwartym przedziale transakcji sumy nie znamy, więc jej nie podajemy -
  // inaczej wiadomość pokazywałaby liczbę bez doliczonej sprzedaży.
  const totalDocs = declaredDocs !== null && !txOpenEnded ? declaredDocs + (salesDocs ?? 0) : null;

  /** Stawka jednej formy rozliczenia przy zadeklarowanym wolumenie. */
  const quoteFor = (t: PricingTable): { table: PricingTable; bucket: DocBucket | null; amount: number | 'custom' } => {
    const bucket =
      totalDocs !== null
        ? t.buckets.find((b) => b.upTo !== null && b.upTo >= totalDocs) ??
          t.buckets.find((b) => b.upTo === null) ??
          null
        : null;
    if (bucket) return { table: t, bucket, amount: rateOf(t, bucket) ?? 'custom' };
    // Bez wolumenu dokumentów bierzemy najniższą stawkę z kolumny właściwej
    // dla statusu VAT - inaczej czynny podatnik zobaczyłby cenę zwolnionego.
    const columnPrices = t.buckets.map((b) => rateOf(t, b)).filter((v): v is number => typeof v === 'number');
    return { table: t, bucket: null, amount: columnPrices.length ? Math.min(...columnPrices) : t.startsFrom };
  };

  const quotes = tableOptions.map(quoteFor);
  // Przy kilku możliwych formach podajemy najtańszą - to jedyna kwota, o której
  // wiemy na pewno, że klient jej nie przekroczy w dół.
  const cheapest =
    quotes
      .filter((q): q is typeof q & { amount: number } => typeof q.amount === 'number')
      .sort((a, b) => a.amount - b.amount)[0] ?? quotes[0];

  const tableSettled = table !== null;
  const tableLabel = tableSettled ? table.shortName : 'forma do ustalenia';
  const accounting: number | 'custom' = txOpenEnded || typeof cheapest.amount !== 'number' ? 'custom' : cheapest.amount;
  // Przy nieustalonej formie nie podajemy przedziału z jednej tabeli: ryczałt ma
  // przedział "51 - 100", a KPiR "51 - 70", więc klient, który wskazał 51 - 70
  // dokumentów, zobaczyłby w opisie cudzy zakres. Podajemy wtedy jego własną
  // deklarację.
  const bucketRange =
    txOpenEnded || !cheapest.bucket
      ? null
      : tableSettled || cheapest.bucket.upTo === null
        ? cheapest.bucket.range.replace(/\s+/g, ' ')
        : `do ${totalDocs}`;
  const vatLabel = cheapest.table.hasVat && vatAnswer ? (vatAnswer === 'zwolniony' ? 'bez VAT' : 'z VAT') : null;

  const accountingNotes: string[] = [];
  if (txOpenEnded) {
    accountingNotes.push(
      'Przy tym wolumenie przygotujemy wycenę indywidualną - różnice między sklepami są zbyt duże, żeby podać kwotę z cennika.',
    );
  } else {
    if (!tableSettled) {
      accountingNotes.push(
        `Najtańszy wariant z form, które u Ciebie wchodzą w grę: ${tableOptions.map((t) => t.shortName).join(', ')}. Dokładną kwotę podamy po wyborze formy opodatkowania.`,
      );
    }
    if (salesDocs !== null && declaredDocs !== null) {
      accountingNotes.push(
        `${declaredDocs} dok. własnych + ${salesDocs} z przeliczenia sprzedaży (${ecommerce.txPerDoc} transakcji = 1 dok.).`,
      );
    }
    if (!cheapest.bucket) accountingNotes.push('Podaj liczbę dokumentów, żeby zobaczyć dokładną stawkę.');
    if (vatAnswer === 'nie-wiem') {
      accountingNotes.push('Liczymy wariant dla czynnego podatnika VAT - przy zwolnieniu kwota będzie niższa.');
    }
    // Dopłaty opisane przy tabeli (konta zespołu 5 przy księgach rachunkowych)
    // pokazujemy obok kwoty, a nie w niej - nie wiemy, czy u klienta wystąpią.
    for (const extra of cheapest.table.notes ?? []) accountingNotes.push(extra);
  }

  monthly.push({
    id: 'accounting',
    label: `Księgowość (${tableLabel})`,
    amount: accounting,
    from: accounting !== 'custom' && (!tableSettled || !cheapest.bucket),
    note: accountingNotes.length ? accountingNotes.join(' ') : undefined,
  });

  /* ── Kanały sprzedaży ponad pierwszy ────────────────────────────────── */
  // Dopłata jest niezależna od wolumenu: każdy kanał ma własny format raportu,
  // strukturę prowizji i cykl wypłat, więc wymaga osobnego uzgodnienia.
  if (channels !== null && channels > ecommerce.freeChannels) {
    const paidChannels = channels - ecommerce.freeChannels;
    monthly.push({
      id: 'channels',
      label: `Platformy sprzedażowe (${channelsOpenEnded ? 'od ' : ''}${paidChannels} ponad pierwszy × ${ecommerce.channelRate} zł)`,
      amount: paidChannels * ecommerce.channelRate,
      module: true,
      ...(channelsOpenEnded ? { from: true } : {}),
      note: 'Pierwszy kanał jest w cenie pakietu.',
    });
  }

  /* ── Procedura OSS ──────────────────────────────────────────────────── */
  // Rejestracja do VAT-UE i informacje podsumowujące zostają w abonamencie.
  // Osobna pozycja dotyczy wyłącznie procedury OSS, czyli odrębnego obiegu ze
  // stawkami kraju nabywcy i własnym kalendarzem deklaracji kwartalnych.
  const b2cUe = isEcommerce ? asText(answers.ecomB2c) : '';
  if (b2cUe === 'tak' || b2cUe === 'nie-wiem') {
    const undecided = b2cUe === 'nie-wiem';
    monthly.push({
      id: 'oss',
      label: 'Procedura VAT OSS',
      amount: ossFees.ossMonthly,
      module: true,
      optional: undecided,
      note: undecided
        ? 'Dotyczy wyłącznie sprzedaży do osób prywatnych z Unii - poza sumą do czasu ustalenia.'
        : 'Monitorowanie progu, stawki kraju nabywcy i deklaracja kwartalna.',
    });
    once.push({
      id: 'oss-setup',
      label: 'Rejestracja do procedury VAT OSS',
      amount: ossFees.ossSetup,
      module: true,
      optional: undecided,
      note: undecided ? 'Jeśli okaże się potrzebna - poza sumą.' : undefined,
    });
  }

  /* ── Procedura IOSS ─────────────────────────────────────────────────── */
  // Odrębny obieg od OSS, choć obie procedury dotyczą sprzedaży konsumentom:
  // IOSS obejmuje przesyłki idące do klienta wprost spoza Unii, a deklaracje
  // składa się w niej co miesiąc, a nie co kwartał - stąd wyższa stawka.
  const iossAnswer = isEcommerce ? asText(answers.ecomIoss) : '';
  if (iossAnswer === 'tak' || iossAnswer === 'nie-wiem') {
    const undecided = iossAnswer === 'nie-wiem';
    monthly.push({
      id: 'ioss',
      label: 'Procedura IOSS',
      amount: ossFees.iossMonthly,
      module: true,
      optional: undecided,
      note: undecided
        ? 'Dotyczy wyłącznie przesyłek idących do konsumenta wprost spoza Unii - poza sumą do czasu ustalenia.'
        : 'Deklaracje miesięczne, stawki kraju nabywcy i rozliczenie zwolnienia z VAT w imporcie.',
    });
    once.push({
      id: 'ioss-setup',
      label: 'Rejestracja do procedury IOSS',
      amount: ossFees.iossSetup,
      module: true,
      optional: undecided,
      note: undecided ? 'Jeśli okaże się potrzebna - poza sumą.' : undefined,
    });
  }

  /* ── Kadry i płace ──────────────────────────────────────────────────── */
  const payrollChoice = asText(answers.payroll);
  const people = PEOPLE_FLOOR[asText(answers.employees)];
  const wantsPayroll = payrollChoice === 'tak';
  if ((wantsPayroll || payrollChoice === 'oferta') && people) {
    monthly.push({
      id: 'payroll',
      label: `Kadry i płace (od ${people} os. × ${hrStandard} zł)`,
      amount: Math.max(people * hrStandard, hrMin),
      from: true,
      optional: !wantsPayroll,
      note: wantsPayroll ? undefined : 'Do decyzji klienta - poza sumą.',
    });
  }

  /* ── Faktury walutowe ponad limit w abonamencie ─────────────────────── */
  // Suwak podaje konkretną liczbę faktur ("15") albo pozycję otwartą ("25+").
  // Przy tej otwartej liczymy dopłatę od progu i oznaczamy wycenę jako "od",
  // bo każda kolejna faktura ponad próg jeszcze ją podniesie.
  const currencyAnswer = asText(answers.currencyDocs);
  if (currencyAnswer) {
    const openEnded = currencyAnswer.endsWith('+');
    const count = Number.parseInt(currencyAnswer, 10);
    const paid = Number.isFinite(count) ? Math.max(0, count - currencyInvoices.freeLimit) : 0;
    if (paid > 0) {
      monthly.push({
        id: 'currency',
        label: `Faktury walutowe (${openEnded ? 'od ' : ''}${paid} ponad limit × ${currencyInvoices.rate} zł)`,
        amount: paid * currencyInvoices.rate,
        ...(openEnded ? { from: true } : {}),
      });
    }
  }

  /* ── Ewidencja IP Box ───────────────────────────────────────────────── */
  // Ulga wymaga ewidencji odrębnej od księgi, prowadzonej co miesiąc, więc jest
  // to stała pozycja abonamentu, a nie opłata roczna. Przy odpowiedzi "nie wiem"
  // pokazujemy stawkę informacyjnie, poza sumą - dopóki nie ocenimy
  // kwalifikowalności, doliczanie jej do wyceny byłoby zawyżaniem kwoty.
  // Regułę pytania sprawdzamy jawnie, bo `estimate` liczy też po stronie serwera,
  // na odpowiedziach prosto z żądania, których nikt wcześniej nie uzgodnił.
  // Bez tego odpowiedź została z poprzedniej formy opodatkowania (np. przy
  // estońskim CIT, który wyklucza ulgę) zawyżyłaby kwotę w wiadomości.
  const ipBoxAnswer = matchRule(questionsById.ipBox.rule, answers) ? asText(answers.ipBox) : '';
  if (ipBoxAnswer === 'tak' || ipBoxAnswer === 'nie-wiem') {
    // Stawkę dla ksiąg rachunkowych bierzemy tylko wtedy, gdy forma jest już
    // przesądzona - przy niepewnej nie zawyżamy kwoty.
    const onBooks = table?.id === 'fk';
    const undecided = ipBoxAnswer === 'nie-wiem';
    monthly.push({
      id: 'ipbox',
      label: `Ewidencja IP Box (${onBooks ? 'księgi rachunkowe' : 'jedno kwalifikowane prawo'})`,
      amount: onBooks ? ipBox.monthlyFk : ipBox.monthly,
      module: true,
      optional: undecided,
      note: undecided
        ? 'Do potwierdzenia po ocenie kwalifikowalności - poza sumą.'
        : onBooks
          ? 'Wskaźnik nexus i rozliczenie ulgi w CIT w cenie.'
          : `Każde kolejne prawo to ${ipBox.nextRight} zł. Załącznik PIT/IP w cenie.`,
    });
  }

  /* ── Zakupy od podmiotów zagranicznych ──────────────────────────────── */
  // Pytanie zadajemy wszystkim, nie tylko sprzedawcom internetowym: moduł
  // VAT-UE uruchamia zakup, a nie sprzedaż, więc dotyczy też firmy zwolnionej
  // z VAT, która poza Polskę nic nie sprzedaje, a kupuje reklamy albo płaci
  // prowizję zagranicznej platformie (Booking, Airbnb, marketplace).
  // Prowizje nie wchodzą do `buysAds`: obowiązek IFT-2R rodzi zakup reklamy,
  // a nie pośrednictwo w sprzedaży.
  // Liczby zagranicznych kontrahentów do IFT-2R nie pytamy, więc ta pozycja
  // zostaje poza sumą - wolimy pokazać stawkę i ustalić resztę przy wycenie,
  // niż zawyżyć kwotę w podsumowaniu.
  const foreignBuy = asText(answers.foreignBuy);
  const buysServices = foreignBuy === 'narzedzia' || foreignBuy === 'prowizje' || foreignBuy === 'reklamy' || foreignBuy === 'oba';
  const buysAds = foreignBuy === 'reklamy' || foreignBuy === 'oba';

  // Moduł stoi obok sumy, a nie w niej: klient zaznaczył zakupy, które dopłatę
  // włączają, ale nie w każdym miesiącu musi ona wystąpić. Pełną stawkę
  // pokazujemy więc przy pozycji, a warunek w notatce - kwota zerowa
  // sugerowałaby, że moduł jest darmowy, a nie że zależy od miesiąca.
  if (buysServices && asText(answers.vat) !== 'czynny') {
    const vatUnknown = asText(answers.vat) !== 'zwolniony';
    monthly.push({
      id: 'vat9m',
      label: 'VAT-UE / import usług (przy zwolnieniu z VAT)',
      amount: foreignTax.vat9m,
      module: true,
      optional: true,
      note: vatUnknown
        ? 'Dotyczy wyłącznie podatnika zwolnionego z VAT. U czynnego podatnika VAT import usług jest w cenie abonamentu.'
        : 'Tylko za miesiące, w których wystąpił import usług. Rejestracja do VAT-UE, wymagana przed pierwszym takim zakupem, jest w abonamencie.',
    });
  }

  if (buysAds) {
    once.push({
      id: 'ift2r',
      label: 'Roczna informacja IFT-2R (pierwszy zagraniczny kontrahent)',
      amount: foreignTax.ift2rFirst,
      optional: true,
      period: 'year',
      note: `Każdy kolejny kontrahent to ${foreignTax.ift2rNext} zł. Weryfikacja obowiązku i rejestracja do VAT-UE są w abonamencie.`,
    });
  }

  /* ── Wniosek o wiążącą informację stawkową ──────────────────────────── */
  // Regułę pytania sprawdzamy jawnie, tak samo jak przy IP Box: `estimate`
  // liczy też po stronie serwera, na odpowiedziach prosto z żądania, więc
  // odpowiedź została z branży zmienionej później doliczyłaby usługę, której
  // klient już nie widzi w formularzu.
  const vatRatesAnswer = matchRule(questionsById.vatRates.rule, answers) ? asText(answers.vatRates) : '';
  if (vatRatesAnswer === 'watpliwosc' || vatRatesAnswer === 'nie-wiem') {
    const undecided = vatRatesAnswer === 'nie-wiem';
    once.push({
      id: 'wis',
      label: 'Wniosek o wiążącą informację stawkową (pierwsza usługa)',
      amount: wis.first,
      optional: undecided,
      note: undecided
        ? `Do potwierdzenia po przejrzeniu cennika - poza sumą. Każda kolejna usługa to ${wis.next} zł, plus ${wis.fee} zł opłaty urzędowej od każdej z nich.`
        : `Każda kolejna usługa to ${wis.next} zł, plus ${wis.fee} zł opłaty urzędowej od każdej z nich. Decyzję wydaje Dyrektor KIS w ciągu ${wis.months} miesięcy.`,
    });
  }

  /* ── Najem prywatny ─────────────────────────────────────────────────── */
  // O dopłacie decyduje liczba zeznań, a nie liczba źródeł przychodu.
  //
  // Najem prywatny rozlicza się ryczałtem, czyli tym samym PIT-28, który
  // składamy za działalność ryczałtowca - najem wchodzi do niego osobną
  // rubryką, a nie osobnym formularzem. U takiego klienta nie ma za co
  // doliczać i pozycja stoi w wyliczeniu z kwotą zerową, tak samo jak
  // bezpłatna rejestracja firmy: klient ma zobaczyć, że o najmie pamiętamy.
  // Przy każdej innej formie (skala, liniowy, karta, CIT) roczne zeznanie
  // z firmy to inny druk, więc PIT-28 od najmu jest dodatkowym dokumentem
  // i dopiero wtedy kosztuje. Wraca co roku, stąd `period: 'year'`.
  //
  // Najem prowadzony w ramach działalności nie dokłada nic w żadnym wariancie:
  // jego przychód wchodzi do rozliczenia firmy, a faktury liczą się jak
  // pozostałe dokumenty w pakiecie.
  //
  // Regułę pytania o formę opodatkowania sprawdzamy jawnie, tak samo jak przy
  // IP Box - `estimate` liczy też po stronie serwera, na odpowiedziach prosto
  // z żądania, a przy nieustalonej formie prawnej odpowiedź mogła zostać
  // z wcześniejszego wyboru.
  const privateRent = asText(answers.privateRent);
  if (privateRent === 'prywatny' || privateRent === 'nie-wiem') {
    const rentTaxForm = matchRule(questionsById.taxForm.rule, answers) ? asText(answers.taxForm) : '';
    // Karta podatkowa kończy się PIT-16A, nie PIT-28, więc do tej grupy nie
    // należy - dlatego pytamy o formę opodatkowania, a nie o tabelę cennika,
    // która karcie przypisuje pakiet ryczałtowy.
    const sameReturn = rentTaxForm === 'ryczalt';
    const taxFormOpen = rentTaxForm === '' || rentTaxForm === 'nie-wiem';
    const undecided = privateRent === 'nie-wiem' || taxFormOpen;
    once.push({
      id: 'private-rent',
      label: 'PIT-28 z najmu prywatnego',
      amount: sameReturn ? 0 : personalReturns.rent,
      period: 'year',
      optional: !sameReturn && undecided,
      note: sameReturn
        ? 'W cenie. PIT-28 składamy za Twoją działalność, a najem wchodzi do tego samego zeznania osobną rubryką.'
        : taxFormOpen
          ? 'Osobne zeznanie obok rozliczenia firmy - poza sumą do czasu wyboru formy opodatkowania. Na ryczałcie najem wchodzi do tego samego PIT-28 i nie kosztuje nic.'
          : privateRent === 'nie-wiem'
            ? 'Do potwierdzenia, czy najem zostaje poza działalnością - poza sumą. Twoja firma rozlicza się innym drukiem, więc byłby to dodatkowy dokument.'
            : 'Osobny druk obok rocznego zeznania z działalności, które jest w abonamencie.',
    });
  }

  /* ── Przejęcie dokumentacji ─────────────────────────────────────────── */
  // Uporządkowane księgi przejmujemy bezpłatnie, także w trakcie roku - tak
  // stoi na liście rabatów w cenniku, więc kreator musi to powiedzieć wprost.
  // Przy zaległościach nakład pracy zależy od tego, co zastaniemy, a takiej
  // stawki w cenniku nie ma, więc zamiast zmyślonej kwoty pokazujemy wycenę
  // indywidualną poza sumą. Regułę pytania sprawdzamy jawnie, tak samo jak
  // przy IP Box - `estimate` liczy też na odpowiedziach prosto z żądania.
  const docsState = matchRule(questionsById.docsState.rule, answers) ? asText(answers.docsState) : '';
  if (docsState === 'biezaco' || docsState === 'drobne') {
    once.push({
      id: 'handover',
      label: 'Przejęcie dokumentacji',
      amount: 0,
      note: 'W cenie, także w trakcie roku.',
    });
  } else if (docsState === 'zaleglosci' || docsState === 'odtworzenie') {
    once.push({
      id: 'handover',
      label: 'Uporządkowanie zaległych ksiąg',
      amount: 'custom',
      optional: true,
      note: 'Kwotę podamy po przejrzeniu dokumentów - poza sumą. Samo przejęcie uporządkowanej dokumentacji jest bezpłatne.',
    });
  }

  /* ── Rabat za księgowość i kadry razem ──────────────────────────────── */
  if (wantsPayroll && people >= bundleDiscount.minEmployees && typeof accounting === 'number') {
    // Rabat dotyczy pakietu "księgowość + kadry", więc podstawą są tylko te
    // dwie pozycje - usługi dodatkowe, jak faktury walutowe, do niej nie wchodzą.
    const base = sumLines(monthly.filter((l) => l.id === 'accounting' || l.id === 'payroll'));
    monthly.push({
      id: 'discount',
      label: `Rabat pakietowy (księgowość + kadry, ${bundleDiscount.minEmployees}+ osób)`,
      amount: -Math.round(base * bundleDiscount.rate),
    });
  }

  const monthlyTotal = accounting === 'custom' ? 'custom' : monthly.length ? sumLines(monthly) : null;
  // Pozycji jednorazowych bywa więcej niż jedna (rejestracja firmy, IFT-2R),
  // więc sumujemy je tak samo jak abonament, zamiast brać pierwszą z brzegu.
  const onceCounted = once.filter((l) => !l.optional);
  // Pozycje pokazywane poza sumą schodzą na koniec listy: najpierw to, za co
  // klient faktycznie zapłaci, potem stawki usług, które dopiero rozważamy
  // (WIS, IFT-2R). Kolejność w obrębie obu grup zostaje bez zmian.
  const onceOrdered = [...onceCounted, ...once.filter((l) => l.optional)];
  // Do sumy jednorazowej wchodzą wyłącznie pozycje płatne raz. Opłata wracająca
  // co roku (PIT-28 z najmu prywatnego) ma własny okres i pokazujemy ją osobno -
  // wliczona tutaj zmieniłaby "jednorazowo" w kwotę, której nazwa przestaje się
  // zgadzać z tym, co klient zapłaci.
  const onceSingle = onceCounted.filter((l) => l.period !== 'year');
  const onceTotal = onceSingle.some((l) => l.amount === 'custom')
    ? 'custom'
    : onceSingle.length
      ? sumLines(onceSingle)
      : null;

  const warehouse = isEcommerce ? asText(answers.ecomWarehouse) : '';

  return {
    table,
    tableOptions,
    tableSettled,
    tableLabel,
    bucketRange,
    vatLabel,
    monthly,
    once: onceOrdered,
    monthlyTotal,
    onceTotal,
    isFrom: monthlyTotal !== 'custom' && monthly.some((l) => l.from && !l.optional),
    ecommerce: isEcommerce
      ? {
          declaredDocs,
          salesDocs,
          totalDocs,
          transactions,
          channels,
          vatForced,
          warehouseAbroad: warehouse === 'tak' || warehouse === 'nie-wiem',
        }
      : null,
  };
}

/**
 * Jednolinijkowy opis podstawy wyceny: forma, przedział dokumentów i status
 * VAT. Ten sam tekst czyta boczny panel kreatora i wiadomość do biura, żeby
 * klient i biuro nie widzieli dwóch różnych opisów tej samej kwoty.
 */
export function estimateScope(est: Estimate, docsWord = 'dok.'): string {
  return [est.tableLabel, est.bucketRange ? `${est.bucketRange} ${docsWord}` : null, est.vatLabel]
    .filter(Boolean)
    .join(' · ');
}

/* ── Opis odpowiedzi (podsumowanie w formularzu i treść maila) ───────────── */

const dateFormatter = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });

export function formatDate(value: string): string {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return value;
  return dateFormatter.format(new Date(Date.UTC(y, m - 1, d)));
}

/** Czytelna odpowiedź na pytanie - etykieta opcji, sformatowana data albo tekst. */
export function answerText(q: Question, answers: Answers): string {
  const value = answers[q.id];
  if (q.type === 'multi') {
    const picked = Array.isArray(value) ? value : [];
    const labels = picked
      .map((v) => (q.options ?? []).find((o) => o.value === v)?.label)
      .filter((l): l is string => Boolean(l));
    return labels.join(', ');
  }
  const text = asText(value);
  if (!text) return '';
  if (q.type === 'choice') return (q.options ?? []).find((o) => o.value === text)?.label ?? text;
  if (q.type === 'date') return formatDate(text);
  return text;
}

export type SummaryRow = { id: string; label: string; value: string };
export type SummarySection = { id: string; title: string; rows: SummaryRow[] };

/**
 * Odpowiedzi pogrupowane w sekcje odpowiadające krokom formularza.
 * `skipSteps` pozwala pominąć krok kontaktowy, który w mailu ma własny blok.
 */
export function summarySections(answers: Answers, skipSteps: string[] = []): SummarySection[] {
  const sections: SummarySection[] = [];
  for (const step of steps) {
    if (skipSteps.includes(step.id)) continue;
    const rows: SummaryRow[] = [];
    for (const q of step.questions) {
      // Pytania ukryte przez reguły pomijamy, ale te wypełnione z linku
      // (pakiet z cennika) trafiają do podsumowania - biuro musi je zobaczyć.
      if (!matchRule(q.rule, answers)) continue;
      const value = answerText(q, answers);
      if (!value) continue;
      rows.push({ id: q.id, label: q.shortLabel ?? q.label, value });
    }
    if (rows.length) sections.push({ id: step.id, title: step.emailTitle ?? stepTitle(step, answers), rows });
  }
  return sections;
}

/** Odpowiedzi, które trafiają na listę w bocznym panelu formularza. */
export const SUMMARY_FIELDS = [
  'mode',
  'legalForm',
  'taxForm',
  'vat',
  'docs',
  'employees',
  'industry',
] as const;

/* ── Payload wysyłany do API ─────────────────────────────────────────────── */

/** Identyfikatory wszystkich pól, jakie API przyjmuje od formularza. */
export const ANSWER_FIELDS: string[] = [
  ...steps.flatMap((s) => s.questions.map((q) => q.id)),
  ...META_FIELDS,
];

/** Obcina i normalizuje dane z żądania - do wiadomości trafia tylko to, co znamy. */
export function sanitizeAnswers(input: unknown): Answers {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: Answers = {};
  for (const field of ANSWER_FIELDS) {
    const value = raw[field];
    const q = questionsById[field];
    const limit = q?.maxlength ?? 200;
    if (Array.isArray(value)) {
      out[field] = value
        .filter((v): v is string => typeof v === 'string')
        .slice(0, 12)
        .map((v) => v.trim().slice(0, limit))
        .filter(Boolean);
    } else if (typeof value === 'string') {
      const text = value.trim().slice(0, limit);
      if (text) out[field] = text;
    }
  }
  return out;
}

/**
 * Walidacja całego zgłoszenia po stronie serwera.
 *
 * Pakiet z cennika (`planTable`) zawęża listę opcji tylko po to, żeby nie pytać
 * użytkownika dwa razy o to samo. Przy sprawdzaniu odpowiedzi go pomijamy -
 * inaczej niespójny parametr w adresie mógłby odrzucić poprawnie wypełniony
 * formularz. O spójność odpowiedzi dbają reguły oparte na formie prawnej.
 */
export function validateSubmission(answers: Answers): Record<string, string> {
  const checked: Answers = { ...answers, planTable: '' };
  const errors: Record<string, string> = {};
  for (const step of steps) {
    Object.assign(errors, validateStep(step, checked));
  }
  return errors;
}
