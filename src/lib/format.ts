/**
 * Formatowanie liczb, kwot i procentów w polskiej konwencji.
 *
 * Jedno miejsce dla całego serwisu, żeby te same wartości wyglądały tak samo
 * w kalkulatorze, w tabeli pod nim i w danych strukturalnych dla wyszukiwarek.
 */

/**
 * Zaokrąglenie do groszy „w górę od połowy”, tak jak liczy ZUS i urząd skarbowy.
 * Zwykłe toFixed(2) potrafi zgubić grosz, bo 314,955 siedzi w pamięci jako
 * 314,954999... - stąd korekta precyzji przed zaokrągleniem.
 */
export const round2 = (v: number) => Math.round(Number((v * 100).toPrecision(12))) / 100;

const formatter = (min: number, max: number) =>
  new Intl.NumberFormat('pl-PL', { minimumFractionDigits: min, maximumFractionDigits: max });

/** Sama liczba, np. 213000 -> „213 000” */
export const num = (v: number, min = 0, max = 2) => formatter(min, max).format(v);

/** Kwota bez groszy: 213000 -> „213 000 zł” */
export const zl = (v: number) => `${num(v, 0, 0)} zł`;

/** Kwota z groszami: 432.54 -> „432,54 zł” */
export const zl2 = (v: number) => `${num(v, 2, 2)} zł`;

/** Kwota z groszami tylko wtedy, gdy są: 4806 -> „4 806 zł”, 67.5 -> „67,50 zł” */
export const zlAuto = (v: number) => (Number.isInteger(v) ? zl(v) : zl2(v));

/** Ułamek jako procent: 0.085 -> „8,5%”, 0.09 -> „9%” */
export const pct = (v: number) => `${num(v * 100, 0, 2)}%`;

/** Wartość zapisana już w procentach: 2.5 -> „2,5%” */
export const pctOf = (v: number) => `${num(v, 0, 2)}%`;

/** Liczba dni/tygodni/miesięcy z odmienioną formą: dni(1) -> „1 dzień”, dni(5) -> „5 dni” */
export const dni = (v: number) => `${num(v, 0, 0)} ${v === 1 ? 'dzień' : 'dni'}`;
