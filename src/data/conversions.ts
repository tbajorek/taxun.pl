/**
 * Rejestr konwersji - jedno miejsce, w którym zapisane jest, co uznajemy za
 * próbę kontaktu i pod jaką nazwą zgłaszamy ją do Google Analytics 4.
 *
 * Do Google Ads nie wysyłamy niczego z przeglądarki. Akcje konwersji w Google
 * Ads są typu "import z Google Analytics 4": Ads liczy konwersję wtedy, gdy
 * GA4 zarejestruje **kluczowe zdarzenie** o umówionej nazwie. Nazwy poniżej to
 * jedyne, co musi się zgadzać między kodem a panelem - resztą (licznik,
 * wartość, okno konwersji) steruje się w Google Ads, bez wdrożenia.
 *
 * Konwersją jest każda próba kontaktu, niezależnie od drogi:
 *
 *   • `generate_lead` - zgłoszenie z formularza przyjęte przez serwer.
 *     Rekomendowana nazwa GA4, wspólna dla kreatora wyceny i formularza
 *     kontaktowego; parametr `form_name` rozróżnia je w raportach, a `value`
 *     z kreatora niesie szacowany abonament miesięczny.
 *   • `phone_click`   - kliknięcie w numer telefonu w dowolnym miejscu
 *     serwisu. Rozmowy nie da się zmierzyć, ale sięgnięcie po słuchawkę to
 *     ta sama intencja co wysłanie formularza.
 *
 * Odsłony (`page_view`) zliczamy osobno i **nie są** konwersją - opisują
 * ruch, a nie zamiar kontaktu.
 *
 * Nowa konwersja to nowa stała tutaj plus - po stronie Google - kluczowe
 * zdarzenie o tej nazwie i akcja konwersji zaimportowana z GA4. Kroki
 * w panelach opisuje `docs/analytics.md`.
 */

/** Zgłoszenie z formularza (kreator wyceny i kontakt). Kluczowe zdarzenie. */
export const LEAD_EVENT = 'generate_lead';

/** Kliknięcie w numer telefonu. Kluczowe zdarzenie. */
export const PHONE_EVENT = 'phone_click';

/** Odrzucona wysyłka formularza. Nie jest konwersją - służy do wykrywania awarii. */
export const FORM_ERROR_EVENT = 'lead_form_error';
