# Pomiar na taxun.pl: Google Analytics 4 i Google Ads

Mierzymy **ruch** i **próby kontaktu**, nic poza tym.

Ruch to odsłony (`page_view`) - zliczamy je, ale konwersją nie są. Próba
kontaktu to każde działanie, w którym ktoś sięga po nas: zgłoszenie z kreatora
wyceny, zgłoszenie z formularza kontaktowego i kliknięcie w numer telefonu.
Wszystkie trzy są konwersjami i wszystkie trzy trafiają do Google Ads. Do tego
`lead_form_error`, żeby awaria formularza nie była niewidoczna.

Nie mierzymy przewijania, kroków kreatora, kalkulatorów, udostępnień ani
kliknięć w zwykłe przyciski - jeżeli któraś z tych rzeczy będzie kiedyś
potrzebna, dokłada się ją świadomie, a nie zostawia "na wszelki wypadek".

Pomiar jest opcjonalny i sterowany zmiennymi środowiskowymi. Bez `PUBLIC_GA_ID`
i `PUBLIC_GOOGLE_ADS_ID` strona nie odwołuje się do Google, nie ładuje gtag.js
i nie zapisuje ciasteczek pomiarowych - cała warstwa pomiarowa zamienia się
w puste wywołania. Każde z narzędzi włącza się osobno i należy do innej
kategorii zgody: GA4 do analitycznej, Google Ads do marketingowej.

## Zmienne środowiskowe

| Zmienna | Zasięg | Opis |
| --- | --- | --- |
| `PUBLIC_GA_ID` | przeglądarka + serwer | Measurement ID strumienia GA4 (`G-XXXXXXXXXX`). Wartość jest wstawiana podczas budowania, więc po zmianie trzeba przebudować stronę. |
| `PUBLIC_GA_DEBUG` | przeglądarka | `1`/`true`/`yes`/`on` włącza `debug_mode` (GA4 → DebugView) i logi zdarzeń w konsoli. |
| `PUBLIC_GOOGLE_ADS_ID` | przeglądarka | Identyfikator konta Google Ads (`AW-XXXXXXXXX`). Konfiguruje tag reklamowy - łącznik konwersji i ciasteczka `_gcl_*`. Samych konwersji tą drogą nie wysyłamy (patrz niżej). |

Na Vercelu wszystkie te zmienne mają prefiks `PUBLIC_`, więc muszą być dostępne
**na etapie budowania** - po zmianie trzeba wdrożyć stronę na nowo. Ustaw je
wyłącznie w środowisku Production: w podglądzie wdrożenia tag ładuje się tak
samo jak na produkcji i zaśmiecałby raporty.

## Budowa

| Plik | Rola |
| --- | --- |
| `src/components/GoogleTag.astro` | Domyślny stan zgody (Consent Mode v2) w `<head>` oraz funkcje `__taxunGaStart()` i `__taxunAdsStart()`, które konfigurują strumień GA4 i konto Google Ads, dociągając przy tym gtag.js. |
| `src/components/CookieConsent.astro` | Baner i okno ustawień - opis kategorii musi odpowiadać rejestrowi integracji. |
| `src/components/SpeedInsights.astro` | Dane o trasie dla Vercel Speed Insights; samo narzędzie startuje dopiero po zgodzie. |
| `src/data/conversions.ts` | Rejestr konwersji - nazwy kluczowych zdarzeń importowanych do Google Ads. |
| `src/lib/analytics.ts` | Typowane funkcje zdarzeń dla kodu w przeglądarce. Jedyne miejsce wywołujące `gtag`. |
| `src/lib/analytics-auto.ts` | Jedyny automatyczny nasłuch: kliknięcia w numer telefonu. |
| `src/lib/consent.ts` | Silnik zgód: zapis, termin ważności, powiadamianie o zmianach. |
| `src/lib/consent-integrations.ts` | Rejestr narzędzi zewnętrznych - kategoria, sygnał zgody, uruchomienie, sprzątanie. |
| `src/lib/page-groups.ts` | Ścieżka → grupa treści (`content_group`) i slug branży. |
| `src/lib/traffic-source.ts` | Źródło wejścia: odesłanie, parametry UTM, strona lądowania. |
| `src/lib/form-client.ts` | Wysyłka formularza w przeglądarce razem ze zdarzeniami konwersji. |
| `src/lib/mailer.ts` | Wspólna trasa API formularzy - walidacja, antyspam, wysyłka maila. |

## Zgody

Pracujemy w **zaawansowanym trybie zgody** (advanced consent mode). Tag Google
jest konfigurowany przy każdym wejściu, a o tym, co Google wolno zrobić
z trafieniem, decyduje stan Consent Mode - nie to, czy trafienie w ogóle
poleci. Granica, która pozostaje twarda: **nic nie zapisujemy na urządzeniu
użytkownika przed zgodą**.

| | Bez zgody | Po zgodzie |
| --- | --- | --- |
| gtag.js | pobrany | pobrany |
| Ciasteczka `_ga`, `_ga_*`, `_gcl_*` | nie zapisywane | zapisywane |
| Rozpoznanie powracającego użytkownika | nie | tak |
| Co dostaje Google | trafienie bezciasteczkowe: adres podstrony, parametry przeglądarki, odmowny stan zgody | pełny pomiar |
| Do czego Google tego używa | statystyczne modelowanie w ujęciu zbiorczym | raporty i rozliczenie kampanii |
| Vercel Speed Insights | nie uruchamiany | uruchamiany |
| Źródło wejścia w `sessionStorage` | nie zapisywane | zapisywane |

Poprzednio działaliśmy w trybie podstawowym - bez zgody gtag.js nie był
pobierany w ogóle. Kosztowało to modelowanie konwersji: ruch osób, które nie
kliknęły w baner, znikał bez śladu, a Google Ads nie miał czego doszacować.
Ponieważ konwersja reklamowa jest importowana z GA4, dotyczyło to wprost
rozliczenia kampanii.

1. Skrypt w `<head>` czyta zapisane preferencje z `localStorage`
   (`taxun-consent-v1`) i ustawia `gtag('consent', 'default', ...)` **zanim**
   cokolwiek poleci do Google. Wracający użytkownik ze zgodą ma więc pełny
   pomiar od pierwszego trafienia, bez czekania na aktualizację. Zapis starszy
   niż `CONSENT_TTL_DAYS` (rok) jest traktowany jak brak decyzji - baner pyta
   ponownie.
2. Bez zapisanej zgody wszystkie sygnały startują jako `denied`. gtag.js i tak
   jest pobierany, a `gtag('config', ...)` wysyła pierwszą odsłonę jako
   trafienie bezciasteczkowe.
3. Decyzja z banera idzie przez `gtag('consent', 'update', ...)`
   (`lib/consent-integrations.ts`) i od tego momentu pomiar jest pełny.
   Wcześniejszej odsłony nie powtarzamy - zostaje bezciasteczkowa.
4. Kategorie z banera mapują się na sygnały Google tak:

   | Kategoria w banerze | Sygnały Consent Mode | Narzędzia |
   | --- | --- | --- |
   | Niezbędne (bez wyboru) | `functionality_storage`, `security_storage` | reCAPTCHA, zapis preferencji |
   | Analityczne | `analytics_storage` | Google Analytics 4, Vercel Speed Insights, zapamiętane źródło wejścia |
   | Marketingowe | `ad_storage`, `ad_user_data`, `ad_personalization`, `personalization_storage` | Google Ads (tylko przy `PUBLIC_GOOGLE_ADS_ID`) |

5. Wycofanie zgody wysyła sygnały `denied` i usuwa ciasteczka `_ga*` i `_gcl*`.
   Pomiar wraca do stanu bezciasteczkowego; Google nie zapisze nowych
   ciasteczek, ale te z okresu zgody trzeba posprzątać samemu (`cleanup`
   w rejestrze integracji).
6. Odsłona (`page_view`) leci dokładnie raz na wczytanie strony, z `gtag('config',
   ...)`.

Biblioteka gtag.js jest jedna dla obu kont, a `gtag('config', ...)` drugiego
konta dociąga jego ustawienia samodzielnie.

**Zdarzenia zawężamy do strumienia GA4** parametrem `send_to`. Bez niego gtag
rozsyła każde zdarzenie do wszystkich miejsc docelowych podpiętych pod tag
Google - w tym do kont Google Ads, gdzie ląduje jako trafienie remarketingowe.
Tag `taxun.pl` ma dwa takie konta (`AW-18422819426` z `PUBLIC_GOOGLE_ADS_ID`
oraz `AW-968830336`, którego kod nie konfiguruje), więc bez zawężenia trafiałaby
tam cała aktywność w serwisie. Konwersja tej drogi nie potrzebuje - do Google
Ads idzie importem kluczowego zdarzenia z GA4.

**Czego nie wysyłamy nigdy.** W zdarzeniach idzie nazwa formularza, kwota,
źródło ruchu i kod błędu. Danych z formularza - imienia, adresu e-mail,
telefonu, treści wiadomości - nie przekazujemy ani do GA4, ani do Google Ads.
Ma to znaczenie właśnie w trybie zaawansowanym, bo część trafień powstaje
zanim użytkownik cokolwiek kliknie w banerze.

**Konwersja Google Ads wymaga obu zgód naraz.** Samo zdarzenie powstaje w GA4
(zgoda analityczna), a użyć go do rozliczenia kampanii wolno Google dopiero po
zgodzie marketingowej (`ad_user_data`). Brak którejkolwiek oznacza, że
konwersja nie zostanie policzona - i tak też opisuje to polityka prywatności.

### Dodanie nowego narzędzia

Nowe narzędzie zewnętrzne to jeden wpis w `integrations` (`consent-integrations.ts`)
z kategorią, sygnałem zgody i funkcją `start`, **oraz** opis w `cookieData`
w `CookieConsent.astro`. Wpis bez opisu oznaczałby zgodę na coś, o czym
użytkownik nie został poinformowany.

## Zdarzenia

| Zdarzenie | Kiedy | Konwersja | Parametry |
| --- | --- | --- | --- |
| `page_view` | automatycznie przez gtag.js, raz na wczytanie strony | nie | standardowe + `content_group`, `page_industry` |
| `generate_lead` | zgłoszenie z dowolnego formularza przyjęte przez serwer | **tak** | `form_name`, `time_to_submit`, źródło ruchu, w kreatorze też `mode`, `value`, `currency` |
| `phone_click` | kliknięcie w dowolny odnośnik `tel:` w serwisie | **tak** | `link_url`, `link_text`, `from_page`, źródło ruchu |
| `lead_form_error` | wysyłka odrzucona przez serwer albo brak połączenia | nie | `form_name`, `error_code` |

Jedno `generate_lead` obsługuje oba formularze, a `form_name` (`wycena` /
`contact`) rozróżnia je w raportach. Nie potrzeba osobnej nazwy dla kreatora,
bo konwersją są teraz obie drogi - gdyby kiedyś miała nią być tylko jedna,
trzeba by wprowadzić drugą nazwę, bo kluczowe zdarzenia rozpoznaje się
wyłącznie po nazwie.

`phone_click` łapiemy jednym nasłuchem na poziomie dokumentu
(`lib/analytics-auto.ts`), więc numer dodany jutro na nowej podstronie mierzy
się bez zmian w kodzie. Przejścia nie odraczamy - odnośnik `tel:` nie opuszcza
strony, tylko przekazuje numer do aplikacji telefonu, więc zdarzenie ma czas
polecieć.

Czego **nie** mierzymy własnym kodem: przewijania, linków wychodzących, pobrań
plików, kliknięć w `tel:`/`mailto:`, kroków kreatora, kalkulatorów, udostępnień
i kliknięć w przyciski. Część z tego potrafi zgłaszać pomiar ulepszony GA4 -
włącza się go przełącznikiem w ustawieniach strumienia danych, bez zmian
w kodzie. Dziś zostawiamy włączone same wyświetlenia strony.

### Wymiary niestandardowe

W GA4 (Administracja → Definicje niestandardowe) warto zarejestrować parametry,
które mają być widoczne w raportach: `form_name`, `error_code`, `mode`,
`page_industry`, `from_page`, `link_text`, `traffic_source`, `traffic_medium`,
`traffic_campaign`, `landing_page`.

`content_group` jest wymiarem wbudowanym - rejestrować go nie trzeba, widać go
od razu w raporcie "Strony i ekrany".

### Skąd przychodzą użytkownicy

* **Lokalizacja** - kraj, region i miasto GA4 wylicza z adresu IP; nie ma tu
  nic do skonfigurowania (raport "Dane demograficzne → Lokalizacja").
* **Źródło wizyty** - `traffic_source` / `traffic_medium` / `traffic_campaign`
  liczymy raz na sesję (parametry UTM, `gclid`, odesłanie, wyszukiwarki) i
  doklejamy do zdarzeń zgłoszenia. Źródło zapamiętujemy przy **każdym**
  wczytaniu strony (`initTrafficSource`), a nie dopiero przy wysyłce formularza
  - inaczej `landing_page` wskazywałby stronę formularza zamiast tej, od której
  zaczęła się wizyta.

## Dlaczego konwersji nie raportujemy z serwera

Zgłoszenie zgłasza wyłącznie przeglądarka. Wcześniej robił to również serwer
Protokołem pomiarowym, a przeglądarka pomijała własne zdarzenia, gdy serwer
zameldował sukces. Ta konstrukcja okazała się nie do utrzymania i została
usunięta.

Powód jest w samym Protokole pomiarowym: **odpowiada `204` na każde poprawnie
sformułowane żądanie**, także wtedy, gdy `api_secret` jest błędny i zdarzenie
zostaje po cichu wyrzucone. Endpoint walidacyjny sekretu nie sprawdza (`/debug/
mp/collect` zwraca puste `validationMessages` również dla klucza wymyślonego -
sprawdzone). Serwer nie miał więc jak odróżnić zapisu od odrzucenia, a mimo to
na podstawie kodu HTTP uciszał przeglądarkę. Skutek błędnej konfiguracji: **brak
konwersji w ogóle**, bez śladu w Tag Assistant (ruch idzie serwer-serwer), bez
śladu w DebugView (nic nie zapisano) i bez śladu w logach (204 to sukces).

Zysk z tej drogi był przy tym mniejszy, niż się wydaje. Zdarzenie serwerowe
wymaga ciasteczka `_ga`, żeby trafić do właściwej sesji - a to ciasteczko
istnieje tylko wtedy, gdy gtag.js już się wykonał. Użytkownikowi z blokerem,
przed którym miała chronić, i tak by nie pomogła.

Zostaje jedna droga, w dodatku widoczna w każdym narzędziu diagnostycznym:
Tag Assistant, DebugView i raport czasu rzeczywistego pokazują dokładnie to,
co poleciało. Jeśli kiedyś wrócimy do pomiaru serwerowego, warunkiem jest
wyzwalacz, który nie ucisza przeglądarki na podstawie niesprawdzalnej obietnicy.

## Konwersje Google Ads

**Do Google Ads nie wysyłamy niczego bezpośrednio z przeglądarki.** Akcje
konwersji w Google Ads są typu **"import z Google Analytics 4"**: Ads liczy
konwersję wtedy, gdy GA4 zarejestruje kluczowe zdarzenie o umówionej nazwie -
`generate_lead` albo `phone_click`. Wybór jest świadomy i ma dwa powody:

* konwersję da się sprawdzić w Tag Assistant i w DebugView, bo powstaje
  w przeglądarce - w przeciwieństwie do zdarzenia wysyłanego z konta
  reklamowego, którego żadne narzędzie nie potwierdzi wprost,
* jest jedna droga zamiast dwóch, więc nie ma jak policzyć tego samego
  zgłoszenia dwa razy.

Tag `AW-...` zostaje skonfigurowany, ale wyłącznie jako łącznik konwersji:
zapisuje `_gcl_*`, czyli identyfikator kliknięcia w reklamę, dzięki czemu
konwersję da się przypisać do kampanii.

### Konfiguracja po stronie Google

Wykonuje się ją raz, a przy zmianie nazwy zdarzenia - ponownie.

**Google Analytics 4**

1. Administracja → Wyświetlanie danych → **Zdarzenia**, zakładka *Kluczowe
   zdarzenia*: oznacz gwiazdką `generate_lead` i `phone_click`. Zdarzenie musi
   być widoczne na liście, a trafia tam po pierwszym wystąpieniu - wyślij więc
   najpierw próbne zgłoszenie i kliknij w numer telefonu na produkcji.
2. Zgaś gwiazdki przy zdarzeniach, których nie używamy (`close_convert_lead`,
   `qualify_lead` i ewentualne pozostałości po kreatorach Google) - inaczej
   zaśmiecają listę celów w Google Ads.
3. Administracja → Wyświetlanie danych → Zdarzenia → **Konfiguracje
   niestandardowe** → *Wszystkie zdarzenia niestandardowe*: nie może tu być
   reguły generującej zdarzenie konwersyjne z wczytania strony (warunki
   `event_name = page_view` i `page_path zaczyna się od /wycena`). Taka reguła
   liczy wejścia na kreator zamiast wysłanych zgłoszeń, a przy "Liczba:
   wszystkie konwersje" - każde odświeżenie strony osobno.
4. Administracja → Strumienie danych → strumień www → **Pomiar ulepszony**:
   zostawiamy wyświetlenia strony, resztę wyłączamy, żeby nie zbierać zdarzeń,
   których nie używamy. To samo w Google Ads → tag Google → **Zarządzaj
   automatycznym wykrywaniem zdarzeń** - te przełączniki dotyczą tego samego
   tagu, tylko z drugiej strony.

**Google Ads**

5. Cele → Konwersje → *Utwórz działanie powodujące konwersję* → **Importuj**
   → Google Analytics 4. Utwórz **dwie** akcje: jedną z `generate_lead`
   (formularze), drugą z `phone_click` (telefon). Obie wrzuć do tej samej grupy
   celów, żeby kampania optymalizowała pod próby kontaktu jako całość.
6. W ustawieniach obu akcji: **Liczba: "Jedna"** - jeden klient to jedno
   zapytanie, nie tyle, ile razy kliknie. Wartość **z Google Analytics 4**:
   kreator wyceny wysyła szacowany abonament miesięczny w `value` razem
   z `currency: 'PLN'`, a kontakt i telefon nie mają wartości, więc dostaną
   kwotę zapasową ustawioną w akcji.
7. Upewnij się, że akcja jest w tym samym koncie, którego identyfikator siedzi
   w `PUBLIC_GOOGLE_ADS_ID`, i że jest oznaczona jako główne działanie
   ("Uwzględnione w celach na poziomie konta").

### Nowa konwersja

Nowa konwersja to nowa stała w `src/data/conversions.ts` plus kroki 1 i 5-7
powyżej dla tej nazwy.
Danych z formularza nie przekazujemy: do Google idzie nazwa formularza,
źródło ruchu i ewentualna wartość - bez imienia, adresu e-mail, telefonu
i treści wiadomości.

## Sprawdzenie wdrożenia

1. Ustaw `PUBLIC_GA_ID` i `PUBLIC_GA_DEBUG=1`, uruchom `npm run dev`.
2. W GA4 → Administracja → DebugView zobaczysz zdarzenia na żywo. Po wysłaniu
   któregokolwiek formularza ma pojawić się `generate_lead` z właściwym
   `form_name`, a po kliknięciu w numer telefonu - `phone_click`.
3. Konwersje widać też w Tag Assistant: na liście wysłanych działań mają
   pojawić się `generate_lead` i `phone_click`, oba wyłącznie do strumienia
   `G-...`. Brak któregokolwiek oznacza problem w kodzie, a nie w konfiguracji
   Google.
4. Skuteczność zgód sprawdza się w narzędziach przeglądarki. W trybie
   zaawansowanym żądania do `googletagmanager.com` i `google-analytics.com`
   **są** obecne od początku - to poprawne. Sprawdzamy co innego: w zakładce
   Aplikacja, przed decyzją i po kliknięciu "Tylko niezbędne", nie może być
   **żadnego** ciasteczka `_ga`, `_ga_*` ani `_gcl_*`, a w zakładce Sieć nie
   może być żądania do `vercel-scripts.com`. Po "Akceptuję wszystkie"
   ciasteczka `_ga` pojawiają się od razu. W parametrze `gcs` żądania do
   `google-analytics.com` widać stan zgody: `G100` to odmowa, `G111` zgoda.
5. W panelu Google Ads status akcji konwersji zmienia się na "Rejestrowanie
   konwersji" dopiero po kilku godzinach od pierwszego zgłoszenia - import
   z GA4 nie jest natychmiastowy.
