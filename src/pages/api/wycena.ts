export const prerender = false;

import {
  answerText,
  estimate,
  estimateScope,
  matchRule,
  modeLabels,
  questionsById,
  sanitizeAnswers,
  summarySections,
  validateSubmission,
  type Answers,
  type EstimateLine,
  type Mode,
} from '../../lib/wizard';
import { ecommerce } from '../../data/pricing';
import type { MailRow, MailSection, MailTile } from '../../lib/mail';
import { createFormRoute } from '../../lib/mailer';

const fmt = new Intl.NumberFormat('pl-PL');

/** Krótki opis pakietu do tematu wiadomości, np. "KPiR, 21 - 30 dok.". */
function planSummary(answers: Answers): string {
  const est = estimate(answers);
  // Także wtedy, gdy klient nie wybrał formy opodatkowania: biuro ma w temacie
  // zobaczyć, że forma jest do ustalenia, a nie pustkę po nazwie pakietu.
  const parts = [est.tableLabel, est.bucketRange ? `${est.bucketRange} dok.` : null].filter(Boolean);
  return parts.join(', ');
}

/**
 * `lines` to pakiet oparty o dokumenty, `modules` - moduły specjalne, czyli
 * dopłaty, które włącza procedura, a nie wolumen. Biuro dzwoni do klienta z
 * tym mailem w ręku, więc musi widzieć od razu, ile kosztuje sam pakiet, a co
 * dołożyły procedury, o których klient nieraz jeszcze nie wie, że go dotyczą.
 */
type PriceSummary = { value: string; note?: string; lines: MailRow[]; modules: MailRow[] };

function priceText(answers: Answers): PriceSummary {
  const est = estimate(answers);
  const zl = (v: number) => `${fmt.format(v)} zł`;
  // Ten sam opis podstawy wyceny co w bocznym panelu kreatora - klient i biuro
  // czytają jedną kwotę opisaną tak samo. Wcześniej wiadomość przy nieustalonej
  // formie rozliczenia wracała z samym "Do ustalenia" i gubiła wszystkie
  // policzone pozycje, choć klient widział je w przeglądarce.
  const scope = estimateScope(est, 'dokumentów');

  // Każda pozycja osobno, żeby biuro widziało, z czego składa się kwota
  // i które elementy klient dopiero rozważa.
  // Pozycja spoza sumy bez uzasadnienia zmusza biuro do zgadywania, czy stawkę
  // doliczyć do oferty - warunek dopisujemy więc do etykiety, w kolumnie opisu.
  // Tak samo kwota zerowa: "PIT-28 z najmu prywatnego - 0 zł" bez powodu wygląda
  // na przeoczenie, a nie na świadomą decyzję, że najem wchodzi do zeznania,
  // które i tak składamy. Panel w przeglądarce notatkę pokazuje, więc bez tego
  // klient i biuro czytaliby dwa różne opisy tej samej pozycji.
  const withNote = (label: string, line: EstimateLine): string => {
    if (line.optional) return line.note ? `${label} - poza kwotą. ${line.note}` : `${label} - poza kwotą`;
    if (line.amount === 0 && line.note) return `${label} - ${line.note}`;
    return label;
  };

  const monthlyRow = (line: EstimateLine): MailRow => ({
    label: withNote(line.label, line),
    value:
      typeof line.amount === 'number'
        ? `${line.amount < 0 ? '-' : line.from ? 'od ' : ''}${zl(Math.abs(line.amount))}`
        : 'wycena indywidualna',
  });
  const onceRow = (once: EstimateLine): MailRow => ({
    label: withNote(`${once.period === 'year' ? 'Rocznie' : 'Jednorazowo'}: ${once.label}`, once),
    value: typeof once.amount === 'number' ? zl(once.amount) : 'wycena indywidualna',
  });

  const lines: MailRow[] = [];
  const modules: MailRow[] = [];
  for (const line of est.monthly) (line.module ? modules : lines).push(monthlyRow(line));
  for (const once of est.once) (once.module ? modules : lines).push(onceRow(once));

  if (est.monthlyTotal === 'custom') {
    return { value: 'Wycena indywidualna', note: `${scope} - wolumen powyżej tabeli cennikowej.`, lines, modules };
  }
  if (typeof est.monthlyTotal !== 'number') {
    return { value: 'Do ustalenia', note: scope, lines, modules };
  }
  const basis = est.bucketRange
    ? est.tableSettled
      ? 'wyliczone z cennika.'
      : `najtańszy wariant z form, które wchodzą w grę: ${est.tableOptions.map((t) => t.shortName).join(', ')}.`
    : 'klient nie podał wolumenu dokumentów.';
  return {
    value: `${est.isFrom ? 'od ' : ''}${zl(est.monthlyTotal)} netto / mies.`,
    note: `${scope} - ${basis}`,
    lines,
    modules,
  };
}

/**
 * Kreator wyceny z /wycena.
 *
 * Konfiguracja SMTP, zgody, reCAPTCHA i obsługa błędów są wspólne dla wszystkich
 * formularzy (`createFormRoute`) - tutaj zostaje sama treść wiadomości.
 */
export const POST = createFormRoute({
  action: 'wycena',
  formLabel: (body) => {
    const mode = sanitizeAnswers(body.answers).mode as Mode;
    return `Wycena - ${modeLabels[mode] ?? 'nieokreślony tryb'}`;
  },
  logName: 'wycena',
  build: ({ body }) => {
    const answers = sanitizeAnswers(body.answers);

    const errors = validateSubmission(answers);
    if (Object.keys(errors).length > 0) {
      return { ok: false, error: 'Validation failed', fields: errors };
    }

    const mode = answers.mode as Mode;
    const modeLabel = modeLabels[mode];
    const firstName = String(answers.firstName ?? '');
    const lastName = String(answers.lastName ?? '');
    const personName = `${firstName} ${lastName}`.trim();
    const email = String(answers.email ?? '');
    const phone = answers.phone ? String(answers.phone) : undefined;
    const company = answers.company ? String(answers.company) : undefined;

    const price = priceText(answers);
    const plan = planSummary(answers);

    const est = estimate(answers);
    const ecom = est.ecommerce;

    // Przy sprzedaży internetowej kafelek pokazuje liczbę dokumentów po
    // przeliczeniu zestawień, a nie samą deklarację klienta - inaczej biuro
    // zobaczyłoby inną liczbę niż ta, z której wynika cena.
    const docsTile =
      ecom && ecom.totalDocs !== null
        ? `${ecom.totalDocs} po przeliczeniu`
        : answerText(questionsById.docs, answers) || 'Do ustalenia';

    const tiles: MailTile[] = [
      { label: 'Forma prawna', value: answerText(questionsById.legalForm, answers) || '-' },
      {
        label: 'Opodatkowanie',
        value: answerText(questionsById.taxForm, answers) || 'Do ustalenia',
      },
      { label: 'Dokumenty / mies.', value: docsTile },
    ];

    // Krok kontaktowy ma w mailu własny układ, więc z sekcji go wyłączamy.
    // Odpowiedzi z pól wielolinijkowych (opis ksiąg do odtworzenia) zachowują
    // podział na akapity - to na ich podstawie wyceniamy pracę, więc zlepione
    // w jeden wiersz byłyby ścianą tekstu.
    const sections: MailSection[] = summarySections(answers, ['kontakt']).map((s) => ({
      title: s.title,
      rows: s.rows.map((r) => ({
        label: r.label,
        value: r.value,
        multiline: questionsById[r.id]?.type === 'textarea',
      })),
    }));

    const contactRows: MailRow[] = [];
    for (const id of ['nip', 'contactPreference', 'referral'] as const) {
      const q = questionsById[id];
      if (!matchRule(q.rule, answers)) continue;
      const value = answerText(q, answers);
      if (value) contactRows.push({ label: q.shortLabel ?? q.label, value });
    }
    if (contactRows.length) sections.push({ title: 'Kontakt i preferencje', rows: contactRows });

    // Bez rozbicia liczba dokumentów w e-commerce wygląda na wziętą z sufitu:
    // klient deklaruje tylko faktury kosztowe i wyciągi, a sprzedaż z platform
    // dochodzi do nich przelicznikiem.
    if (ecom && ecom.totalDocs !== null) {
      const docRows: MailRow[] = [
        { label: 'Dokumenty zadeklarowane (faktury kosztowe, wyciągi)', value: `${ecom.declaredDocs}` },
        {
          label: `Sprzedaż po przeliczeniu (${ecommerce.txPerDoc} transakcji = 1 dok.)`,
          value: ecom.salesDocs !== null ? `${ecom.salesDocs}` : 'do ustalenia',
        },
        { label: 'Razem do przedziału cennikowego', value: `${ecom.totalDocs}` },
      ];
      if (ecom.channels !== null) {
        docRows.push({
          label: 'Kanały sprzedaży',
          value: `${ecom.channels}${ecom.channels > ecommerce.freeChannels ? `, w tym ${ecom.channels - ecommerce.freeChannels} płatne` : ' (w cenie pakietu)'}`,
        });
      }
      docRows.push({
        label: 'Przelicznik wyciągów i raportów z bramek',
        value: `${ecommerce.linesPerDoc} pozycji = 1 dok.`,
      });
      sections.push({ title: 'Jak policzyliśmy dokumenty', rows: docRows });
    }

    // Rozbicie pakietu pokazujemy też przy jednej pozycji, o ile doszły moduły -
    // inaczej sekcja modułów wisiałaby bez kwoty, do której się dokłada.
    if (price.lines.length > 1 || (price.lines.length > 0 && price.modules.length > 0)) {
      sections.push({ title: 'Z czego wynika kwota', rows: price.lines });
    }
    if (price.modules.length > 0) sections.push({ title: 'Moduły specjalne', rows: price.modules });

    // Zastrzeżenia zakresu. Magazyn poza Polską oznacza rejestrację do VAT w
    // kraju magazynu, której nie prowadzimy - wycena jej nie obejmuje i trzeba
    // to powiedzieć wprost, zanim klient uzna, że jest w cenie.
    const caveats: MailRow[] = [];
    if (ecom?.warehouseAbroad) {
      caveats.push({
        label: 'Magazyn poza Polską',
        value: 'Wycena nie obejmuje rejestracji do VAT w kraju magazynu. Procedura OSS jej nie zastępuje - do omówienia na konsultacji, ze wskazaniem partnera.',
      });
    }
    if (ecom?.vatForced) {
      caveats.push({
        label: 'Asortyment wyłączony ze zwolnienia z VAT',
        value: 'Przy sprzedaży na odległość zwolnienie nie przysługuje od pierwszej transakcji, więc wycena liczona jest dla czynnego podatnika VAT.',
      });
    }
    // Zawieszona działalność to jedyna sytuacja, w której kwota miesięczna nie
    // opisuje najbliższego miesiąca, tylko obsługę po wznowieniu. Regułę
    // pytania sprawdzamy jawnie, bo pracujemy na odpowiedziach prosto z
    // żądania - przy formie prawnej bez możliwości zawieszenia odpowiedź
    // mogłaby zostać z wcześniejszego wyboru.
    if (
      matchRule(questionsById.suspension.rule, answers) &&
      String(answers.suspension ?? '') === 'trwa'
    ) {
      caveats.push({
        label: 'Działalność zawieszona',
        value: 'Firma jest zawieszona w chwili wypełniania formularza, więc kwota miesięczna opisuje obsługę po wznowieniu. Rok domyka zeznanie niezależnie od przerwy, a termin startu stałej obsługi ustalamy na konsultacji.',
      });
    }
    if (ecom) {
      caveats.push({
        label: 'Podstawa wyceny',
        value: 'Kreator liczy na przedziałach. Dokładną kwotę potwierdzamy na rzeczywistych liczbach klienta, a cena z dnia zawarcia umowy obowiązuje przez 12 miesięcy.',
      });
    }
    if (caveats.length) sections.push({ title: 'Zastrzeżenia do wyceny', rows: caveats });

    const meta: MailRow[] = [];
    if (answers.planTable) {
      meta.push({
        label: 'Wejście z cennika',
        value: `pakiet ${String(answers.planTable)}${answers.planDocs ? ` / do ${String(answers.planDocs)} dok.` : ''}`,
      });
    }
    if (typeof body.source === 'string' && body.source) {
      meta.push({ label: 'Adres formularza', value: body.source.slice(0, 300) });
    }

    const doc = {
      subject: `Wycena: ${modeLabel} - ${personName}${plan ? ` (${plan})` : ''}`,
      preheader: `${modeLabel} · ${price.value}${plan ? ` · ${plan}` : ''}`,
      badge: modeLabel,
      title: `Nowe zgłoszenie: ${company || personName}`,
      personName,
      email,
      phone,
      company,
      tiles,
      callout: { label: 'Szacowany abonament', value: price.value, note: price.note },
      sections,
      message: answers.notes ? { title: 'Uwagi klienta', body: String(answers.notes) } : undefined,
      meta,
    };

    return { ok: true, doc };
  },
});
