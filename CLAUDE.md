# Taxun - zasady pracy nad serwisem

## Cennik ma trzy miejsca, nie jedno

Każda zmiana w cenniku (nowa pozycja, zmiana stawki, zmiana tego, co wchodzi
w abonament) musi przejść przez wszystkie trzy warstwy, inaczej klient zobaczy
inną cenę na stronie, inną w kreatorze i jeszcze inną w mailu:

1. **`src/data/pricing.ts`** - źródło prawdy. Kwoty definiujemy tylko tutaj,
   nigdy wprost w treści strony. Stałe podatkowe analogicznie w
   `src/lib/tax-constants.ts`.
2. **Kreator wyceny** - `src/data/wizard.ts` (pytanie, na podstawie którego
   wiemy, czy pozycja klienta dotyczy) oraz funkcja `estimate()` w
   `src/lib/wizard.ts` (pozycja w wyliczeniu). Bez pytania w kreatorze nowa
   pozycja nigdy się nie pokaże.
3. **Szablon maila** - `src/pages/api/wycena.ts`. Sekcja "Z czego wynika kwota"
   składa się z `est.monthly` i `est.once`, a odpowiedzi z kreatora wchodzą
   automatycznie przez `summarySections()`. Wychodzi jeden mail, do biura,
   z reply-to klienta; nie ma autoodpowiedzi do klienta.

Do tego strony, które opisują daną usługę: `/cennik` (katalog usług dodatkowych
i FAQ) oraz właściwa podstrona branżowa. Plik `/llms.txt`
(`src/pages/llms.txt.ts`) też powtarza ceny i również czyta je z `pricing.ts`.

Pozycje pokazywane poza sumą oznaczamy `optional: true`, a takie, które wracają
co roku, `period: 'year'`. Szacujemy defensywnie: jeśli nie wiemy, czy opłata
wystąpi, pokazujemy stawkę obok kwoty, a nie w niej.

Wycena nigdy nie zostaje bez pakietu. Klient może nie znać formy opodatkowania
("nie wiem, potrzebuję rekomendacji") i przejść z tą odpowiedzią cały formularz.
`estimate()` liczy wtedy najtańszy wariant z form, które przy jego odpowiedziach
wchodzą w grę (`candidateTables`), i oznacza kwotę jako "od". Kwota "od" ma być
dolną granicą, a nie najniższą liczbą z cennika - stawka za dziesięć dokumentów
przy stu pięćdziesięciu zadeklarowanych to nie jest oszacowanie.

Panel w przeglądarce i wiadomość do biura czytają jedno wyliczenie i ten sam
opis podstawy (`estimateScope`). Jeżeli którakolwiek strona musi coś ukryć albo
dopisać po swojemu, brakującą informację dokładamy do `Estimate`, a nie do
renderowania - inaczej klient i biuro znowu zobaczą dwie różne kwoty.

### Obietnice z sekcji "abonament all-inclusive"

`includedInPlan` to lista rzeczy, za które nie bierzemy dopłaty, więc nic z niej
nie ma prawa pojawić się jako płatna pozycja w `additional`, wśród
`specialModules` ani w wyliczeniu kreatora. Pozycje zawężamy tam, gdzie zakres
jest węższy niż hasło: import usług jest w cenie u czynnego podatnika VAT, ale
u zwolnionego uruchamia moduł VAT-UE, a roczne zeznanie jest w cenie w części
dotyczącej działalności, bo prywatny PIT-37 stoi w usługach dodatkowych.

Widełek oszczędności nie wpisujemy w treść - biorą się z `hiddenFeesPerYear`,
czyli z tych samych stawek rynkowych co zestawienie na `/cennik#porownanie`.
Zdanie, którego arytmetyka się nie zgadza, jest sloganem, a nie deklaracją
weryfikowalną.

### Pakiet oparty o dokumenty kontra moduły specjalne

Cennik ma dwie warstwy i nie wolno ich mieszać. Pakiet z `tables` wyceniamy
liczbą dokumentów. Moduł specjalny (`specialModules`) to stała dopłata
miesięczna, którą włącza konkretna procedura, a nie wolumen - kosztuje tyle
samo przy dwudziestu dokumentach co przy dwustu. Tak działa VAT-UE i import
usług u podatnika zwolnionego z VAT (nievatowiec kupujący reklamy za granicą
musi się zarejestrować do VAT-UE, choć nie przybyło mu dokumentów), procedury
OSS i IOSS, każdy kanał sprzedaży ponad pierwszy oraz ewidencja IP Box.

Nowy moduł to: wpis w `specialModules`, pytanie w kreatorze, pozycja w
`estimate()` oznaczona `module: true` oraz - jeśli dotyczy - opis na
`/cennik#moduly`. Flaga `module` grupuje pozycję w bocznym panelu kreatora
i w osobnej sekcji wiadomości, więc bez niej dopłata wygląda na część pakietu.
Czynności rozliczane od sztuki albo jednorazowo zostają w `additional`.

## Konwencje treści

- **Nie używamy długiej pauzy.** Zawsze dywiz otoczony spacjami.
- Forma "my" po stronie biura, "Ty" po stronie klienta.
- Deklaracje weryfikowalne zamiast sloganów, bez presji sprzedażowej
  (żadnych "ostatnich wolnych miejsc").
- Teksty mają brzmieć jak napisane przez człowieka, nie przez model.
- Niczego, co jest skonfigurowane, nie wpisujemy w treść na sztywno: telefon
  i dane firmy z `src/data/site.ts`, kwoty z `pricing.ts`, stawki i limity
  z `tax-constants.ts`.

## Zastrzeżenie prawne pod każdą treścią podatkową

Nie jesteśmy doradcami podatkowymi. Zawodowe udzielanie porad, opinii
i wyjaśnień dotyczących obowiązków podatkowych konkretnego podatnika jest
czynnością zastrzeżoną (art. 2 ust. 1 pkt 1 w zw. z ust. 2 ustawy o doradztwie
podatkowym), tak samo jak reprezentowanie go przed organami (pkt 4). Grzywna
z art. 81 tej ustawy sięga od 1 marca 2026 r. 100 000 zł. Prowadzenie ksiąg
i ewidencji (pkt 2), deklaracje i zeznania (pkt 3) oraz obowiązki informacyjne
(pkt 3a) zastrzeżone nie są i to jest to, co robimy.

Konsekwencja dla treści: **nie piszemy, że doradzamy ani że reprezentujemy.**
Liczymy warianty, przygotowujemy dokumentację i wyjaśnienia, kompletujemy
zestawienia z ksiąg. Nazewnictwo pilnujemy też w cenniku - pozycja, która
opisuje czynność zastrzeżoną, musi mówić, kto ją faktycznie wykonuje.

Treść zastrzeżenia stoi w `src/data/legal.ts` i nigdzie indziej. Renderuje ją
`src/components/LegalNotice.astro`. Zdanie, które dotyczy jednej strony,
wstawiamy na tej stronie przez `<slot>` - kreator wyceny musi napisać, że
wyliczenie nie jest ofertą w rozumieniu art. 66 k.c., ale nikt inny tego zdania
nie potrzebuje i konfiguracja nie ma być zbiorem wariantów.

Zastrzeżenie **opisuje charakter treści i nie wyłącza odpowiedzialności.**
Postanowienie wyłączające albo istotnie ograniczające odpowiedzialność wobec
konsumenta jest klauzulą niedozwoloną (art. 385(3) pkt 2 k.c.), więc zdanie
w rodzaju "nie ponosimy odpowiedzialności za skutki" byłoby bezskuteczne,
a przy okazji samo w sobie ryzykowne.

### Gdzie ramka się pokazuje

Dokładnie raz na stronie, nigdy dwa razy. Decyduje o tym jedno z dwóch:

1. **Wpis w `src/data/legal-updated.json`** - `BaseLayout` sprawdza adres
   strony i sam renderuje ramkę pod treścią. Tak działają strony ofertowe
   i branżowe. Nowa podstrona branżowa to jedna linia w tym pliku.
2. **`<LegalNotice>` wstawiony na stronie** - dla stron, które mają do dodania
   własne zdanie (artykuły, kalkulatory, słownik, kreator wyceny). Takich stron
   nie ma w JSON-ie, inaczej zastrzeżenie pojawiłoby się dwa razy.

Strony bez treści podatkowej (kontakt, o nas, lista artykułów) mają tylko
jedno zdanie w stopce, krótsze niż ramka i celowo nie identyczne.

### Data stanu prawnego

Każda ramka podaje dzień, na który treść była sprawdzana. Skąd go bierze:

- **Artykuły** - z `updatedDate` w frontmatterze, a bez niego z `pubDate`.
  To ta sama data, którą widać w nagłówku artykułu.
- **Strony spoza bloga** - z `src/data/legal-updated.json`, kluczem jest
  ścieżka. Plik nie zawiera niczego poza datami, żeby dało się go edytować
  bez czytania kodu wokół.
- **Kalkulatory** - z `DATA_AKTUALIZACJI` w `tax-constants.ts`, bo o rocznych
  stałych uczciwie da się powiedzieć tylko miesiąc i rok.

**Przeglądając stronę, zmieniasz jedną datę w JSON-ie.** Nic tego nie sprawdza,
nie przypomina i nie blokuje commitu - próbowaliśmy okna weryfikacji z hakiem
i przebiegiem CI, i to zostało usunięte świadomie.

Tak samo świadomie **nie aktualizujemy daty automatycznie przy zmianie pliku
strony.** Data mówi "stan prawny sprawdzony", czyli że ktoś przejrzał stawki.
Bump przy każdej edycji zmieniłby jej znaczenie na "plik ruszony", a to co
innego: w historii repozytorium 20 z 54 commitów dotykających tych stron nie
miało nic wspólnego ze stawkami (dane strukturalne, menu, układ). Do tego data
jest per strona, a weryfikacja per twierdzenie - dorzucenie dziesiątej karty
branżowej na `/ksiegowosc` nie sprawdza dziewięciu pozostałych. Data
przestawiona przez skrypt przy zmianie klasy CSS jest gorsza niż data stara:
stara zachęca do sprawdzenia, świeża i nieprawdziwa usypia.

## Podstrony branżowe

Nowa branża to jeden plik w `src/pages/` zbudowany na tym samym schemacie
(`PageHero`, `ProcessSteps`, `FAQ`, `CTA`, `Stats`, `Icon`) z własnym prefiksem
klas CSS, plus wpis w `industries` w `src/data/site.ts` - menu, stopka
i sitemapa czytają tę listę, więc nie trzeba ich ruszać osobno. Do tego wpis
w `src/pages/llms.txt.ts`, odnośnik z karty na `/ksiegowosc#dla-kogo` oraz
wpis w `src/data/legal-updated.json` - bez niego podstrona nie dostanie
zastrzeżenia prawnego.

## W repozytorium leży to, co ktoś pobiera

Warianty zdjęć artykułów (`public/posts/_optimized/`) i obcięte kroje pisma
(`src/assets/fonts/`) są generowane, ale commitowane. Deployment ma je brać
z repozytorium, a nie składać od nowa - kodowanie jednego zdjęcia to około pół
minuty, więc inaczej czas budowania rośnie z każdym artykułem.

Oryginałów zdjęć **nie commitujemy**. Mają 4000-6700 px, ważą 2-3 MB i nikt
ich nie pobiera: `<picture>` zawsze trafia w wariant AVIF albo WebP.
`npm run covers` koduje z nich komplet plików i przenosi oryginał do
`.originals/`, poza gitem. Dlatego żaden adres na stronie nie może wskazywać
na `/posts/nazwa.jpg` - awaryjny `<img src>` i obrazek Open Graph też
pochodzą z manifestu.

Konsekwencja: ani CI, ani Vercel nie odtworzą brakującego pliku, bo nie mają
z czego. Brak jest twardym błędem, a pilnują tego dwie rzeczy - hak
pre-commit (`.githooks/pre-commit`, włączany przez `npm install`) i przebieg
`.github/workflows/assets.yml`. Obie uruchamiają `npm run check:assets`.

Nowe zdjęcie w commicie to więc pliki z `_optimized/` plus `manifest.json`,
nigdy oryginał. Zdjęcie wycofuje się przez
`npm run covers -- --forget nazwa.jpg`. Szczegóły w `docs/cover-photos.md`.

### Zdjęcia poza blogiem

Obrazki wstawiane w treść stron leżą w `src/assets/images/`, a kod sięga po nie
nazwą pliku bez rozszerzenia: `hero.jpg` to `image('hero')` z
`src/data/images.ts`. Nowy obrazek to wrzucenie pliku i dopisanie zdania do
`ALT` w tym module - bez importu i bez zmiany w komponencie. Warianty AVIF
i WebP składa potok obrazów Astro w budowaniu, więc tych plików nie
commitujemy; commitujemy sam obrazek źródłowy, bo bez niego nie ma z czego ich
złożyć.

Źródło zapisujemy skompresowane i w rozdzielczości, której strona faktycznie
używa. Najszerszy wariant, jaki `HeroPhoto` składa, ma 1000 px - tyle potrzebuje
ramka szerokości 499 px na ekranie o podwójnej gęstości - więc źródło ma 1000 px
szerokości i ani piksela więcej. Wyżej nikt tych pikseli nie pobiera: potok
obrazów i tak zejdzie do wariantu, a nadmiar płaci każdy, kto klonuje
repozytorium (cztery zdjęcia schudły z 626 do 332 kB przy niezmienionym
wyglądzie strony).

PNG jest formatem dla grafiki z płaskimi kolorami, nie dla zdjęcia - ta sama
fotografia potrafi ważyć w nim kilkanaście razy więcej niż w JPEG-u, którego
nikt od niej nie odróżni.

Blok powitalny podstrony bierze zdjęcie przez `image="nazwa"` w `PageHero`,
a strona główna przez `image('hero')` w `HomeHero`. Rysuje je jeden komponent,
`HeroPhoto.astro`. **Brak pliku nie jest błędem** - `image()` zwraca wtedy
`null`, blok powitalny zostaje jednokolumnowy i tyle. Strona ma się budować,
zanim ktokolwiek przygotuje zdjęcie, więc nazwa wpisana w `PageHero` to
zaproszenie, a nie zależność.

Kadru nie przycinamy: ramka bierze proporcję z pliku, a bardzo wysoki obrazek
zwężamy, zamiast obcinać mu górę i dół. Zdjęcie wypełnia swoją kolumnę -
sztywna szerokość dobrana pod kadr pionowy zostawiała kadr poziomy małym
i doklejonym z boku. Zwężanie ma swoją granicę w `MAX_HEIGHT` w `HeroPhoto`
i ta sama liczba idzie do `sizes`, bo inaczej przeglądarka dobiera wariant pod
szerokość, której ramka nigdy nie osiąga - pionowy kadr pobierał wariant 1000 px
na ramkę szerokości 293 px.

**Zanim zdjęcie się załaduje, nie ma go widać w żaden sposób.** Ramka nie ma
obwódki, cienia ani tła, a `color: transparent` na obrazku gasi opis
alternatywny - inaczej przez tę jedną chwilę przed pobraniem w bloku
powitalnym mrugała obrysowana skrzynka z białym akapitem w środku. Proporcja
zostaje, więc miejsce jest zarezerwowane i układ nie skacze. Atrybutu `alt`
nie ruszamy: jest dla czytników ekranu i wyszukiwarek, a nie do oglądania.

Poniżej 981 px zdjęcie znika, bo blok powitalny ma na telefonie zmieścić
nagłówek i przyciski bez przewijania. Nie znaczy to jednak `loading="lazy"`:
przy leniwym ładowaniu przeglądarka odkrywała zdjęcie dopiero po pierwszym
wyliczeniu układu, czyli zwlekała z pobraniem dokładnie tam, gdzie zdjęcie widać
od razu. Dlatego zdjęcie jest `eager`, z wysokim
priorytetem, a `<picture>` piszemy wprost, z `media="(min-width: 981px)"` na
każdym `<source>` i przezroczystym pikselem w `src`. Telefon nie pobiera wtedy
ani bajta, desktop startuje razem z dokumentem, a `<Picture>` z Astro tu nie
wystarczy, bo nie przepuszcza `media`.

Świadoma cena: przy indeksowaniu mobilnym robot nie widzi tego zdjęcia, więc
nie trafi ono do wyszukiwarki grafiki. To ilustracja usługi, a nie treść, po
którą ktoś przychodzi.

Opis w `ALT` mówi, czego dotyczy strona, a nie kto jest na zdjęciu. Ze zdjęcia
nie wynika, czy osoba przy biurku to księgowa, czy klientka, a zdanie, które to
rozstrzyga, po prostu zmyśla. Obrazek bez wpisu dostaje pusty opis, czyli idzie
jako ozdoba, i mówi o tym ostrzeżenie w konsoli budowania.

### Logo ma jedno źródło

`src/assets/brand/logo.png` to jedyny plik logo, który się edytuje. Znak
w nagłówku i stopce, ikona karty przeglądarki, ikona ekranu głównego w iOS
i obrazek Open Graph powstają z niego przez `npm run brand`
(`scripts/build-brand.mjs`) i są commitowane, bo deployment ma je brać
z repozytorium.

Znak wycinamy z logo, a nie rysujemy osobno. Rysunek wektorowy, który stał tu
wcześniej, przedstawiał ten sam znak, ale trochę inaczej: inna grubość
strzałki, inny promień rogów - i ta różnica wychodziła wszędzie tam, gdzie znak
sąsiadował z pełnym logo. Skrypt liczy prostokąt znaku z samego pliku (przerwa
z przezroczystych pikseli między znakiem a napisem), więc kolejna wersja logo
o innych proporcjach nie wymaga poprawki w kodzie.

Znaku nie powiększamy ponad to, co daje logo: w nagłówku i stopce wyświetla się
w 40-44 px, więc nawet ekran o potrójnej gęstości mieści się w rozdzielczości
źródła. Z tego samego powodu zniknął `mask-icon` - przypięte karty w Safari
wymagają jednokolorowego SVG, czyli narysowania znaku drugi raz.

## Jeden skrypt na stronę

Każdy `<script>` w komponencie Astro to osobny punkt wejścia bundlera, czyli
osobne żądanie. Gorzej: kod używany przez dwa takie skrypty (silnik zgód,
analityka) ląduje w osobnym pliku, który przeglądarka odkrywa dopiero po
pobraniu i sparsowaniu punktu wejścia - druga runda w sieci za dwa kilobajty.
Dlatego cała warstwa kliencka wspólna dla podstron startuje z jednego
`<script>` w `BaseLayout.astro`, a jej moduły są wymienione w `CLIENT_RUNTIME`
w `astro.config.mjs` i sklejane w jeden plik `taxun.[hash].js`.

Nowe zachowanie na wszystkich podstronach to więc funkcja w `src/lib/`, wpis
w `CLIENT_RUNTIME` i wywołanie w tym jednym skrypcie - nie nowy `<script>`
w komponencie. Skrypty jednej podstrony (kalkulatory, kreator wyceny)
zostają przy niej; do `CLIENT_RUNTIME` nie trafiają, bo strona główna
pobierałaby kod, którego nigdy nie uruchomi.

Wyjątkiem są skrypty, od których zależy widoczność treści: odsłanianie sekcji
(`.reveal` startuje z `opacity: 0`), nawigacja i decyzja o pokazaniu banera
zgód. Nie mają importów, więc Astro wstawia je wprost do dokumentu i działają
bez czekania na sieć.

Taki skrypt w ogóle nie czyta geometrii strony. Odczyt `scrollY`,
`offsetWidth` czy `getBoundingClientRect` przy nieaktualnym układzie każe
przeglądarce policzyć go synchronicznie - na dławionym procesorze wychodziło
z tego ~49 ms zablokowanego wątku. Odkładanie odczytu przez
`requestAnimationFrame` tego nie rozwiązuje, także podwójne: między klatkami
układ i tak zdąży się unieważnić (podmiana kroju, klasy dokładane przy
odsłanianiu sekcji), więc kolejny odczyt znowu wymusza przeliczenie. Zamiast
odczytu używamy `IntersectionObserver` - przecięcia liczy w rytmie klatek i sam
podaje stan początkowy. Stan przewinięcia nagłówka bierze się właśnie stąd:
z 8-pikselowego znacznika `.scroll-sentinel` leżącego poza układem na górze
strony, a nie z `window.scrollY`.

Uwaga na pomiar: bez dławienia procesora wymuszone przeliczenia bywają
niewidoczne. Ślad trzeba zbierać z `Emulation.setCPUThrottlingRate`, inaczej
wynik jest fałszywie czysty.

Baner zgód jest tu przypadkiem, który tę zasadę wymusił. Na telefonie zajmuje
ponad połowę okna, więc to jego akapit jest największym elementem treści.
Pokazywany z doładowanego skryptu ciągnął LCP za sobą o kilka sekund, bo
największy element czekał na pobranie i wykonanie `taxun.js`, a nie na
renderowanie strony. Dlatego o widoczności decyduje `data-consent` ustawiane
na dokumencie jeszcze w trakcie parsowania, a CSS tylko pokazuje albo chowa.
Reguła ogólna: nic, co wypełnia pierwszy ekran, nie może czekać na `taxun.js`.

Wspólny plik i tak zostaje osobnym żądaniem, a przeglądarka odkrywa go dopiero
po sparsowaniu skryptu strony. Dlatego integracja `optimizeBuiltScripts`
w `astro.config.mjs` poprawia gotowy build dwa razy. Astro samo tego nie zrobi:
HTML powstaje w budowaniu serwerowym, które kończy się przed budowaniem na
przeglądarkę, więc nazwy plików z odciskiem treści jeszcze wtedy nie istnieją.

Po pierwsze dopisuje `<link rel="modulepreload">` dla zależności każdego
skryptu, żeby wspólny plik i punkt wejścia startowały razem. Bez `crossorigin` -
moduły z własnej domeny pobiera się bez CORS-u i atrybut kazałby przeglądarce
pobrać plik drugi raz.

Po drugie wstawia do dokumentu punkty wejścia poniżej 4 kB, przepisując ich
importy na adresy bezwzględne. Po zbudowaniu punkt wejścia układu ma 77 bajtów
(import wspólnego pliku i cztery wywołania), a runtime `prefetch` Astro niecałe
2,5 kB - osobne żądanie kosztuje więcej niż taka treść. Astro robi dokładnie to
samo ze skryptami bez importów; tutaj rozciągamy zasadę na małe punkty wejścia.
Próg jest celowo niski: wspólny `taxun.js` (~14 kB) ma zostać osobnym plikiem,
bo pobiera się raz na całą witrynę i siedzi w pamięci podręcznej. Cena to około
1 kB po kompresji na każdej stronie.

Arkusze stylów wstawiamy do dokumentu (`inlineStylesheets: 'always'`), więc na
ścieżce krytycznej nie ma żadnego żądania o CSS. Oba kroje pisma preloadujemy
z `BaseLayout.astro`: bez preloadu krój nagłówków ruszał dopiero po pierwszym
wyliczeniu układu i kończył się o kilkaset milisekund później niż tekstowy.
Odnośniki pobieramy w tle dopiero przy najechaniu kursorem
(`prefetch.defaultStrategy: 'hover'`) - przy `viewport` strona główna ściągała
kilkadziesiąt dokumentów, zanim ktokolwiek cokolwiek kliknął.

Obrazki, których adres nie musi być stały (logo w nagłówku i stopce), importujemy
z `src/assets/`, a nie linkujemy z `public/`. Plik dostaje wtedy nazwę z odciskiem
treści i roczny, niezmienny nagłówek pamięci podręcznej z reguły dla `/assets/`
w `vercel.json`. W `public/` zostają tylko adresy, które muszą być stałe, bo
odwołują się do nich dane strukturalne i Open Graph.

## Nic obcego przed pierwszą interakcją

Tag Google pracuje w zaawansowanym trybie zgody, więc konfigurujemy go przy
każdym wejściu, ale samą bibliotekę (`gtag.js`, ~190 kB po kompresji) pobieramy
dopiero przy pierwszym przewinięciu, dotknięciu, kliknięciu albo klawiszu.
Wpisy `consent default`, `set`, `js` i `config` idą jak dotąd synchronicznie do
kolejki `dataLayer`, a biblioteka odczytuje ją po starcie w tej samej
kolejności - odsłona i stan zgody docierają kompletne, zmienia się tylko moment.

Powód jest mierzalny. Wykonanie gtag.js zajmuje wątek główny na ponad 200 ms
(w pomiarze na dławionym łączu blokada rosła z 207 do 424 ms). Dopóki
biblioteka startowała sama - najpierw w `<head>`, potem zaraz po `load` -
wpadała w okno pomiaru raz tak, raz nie, i wynik PageSpeed skakał między ~87
a 100 przy niezmienionym kodzie. Przy starcie na interakcję to okno jest zawsze
puste, bo audyt nigdy nie dotyka strony.

Cena jest świadoma i była decyzją właściciela serwisu: kto wejdzie i wyjdzie,
nie ruszając ekranu, nie zostanie policzony. Jeżeli kiedykolwiek dojdzie tu
kolejny zewnętrzny skrypt, ma się podpiąć pod ten sam mechanizm, a nie startować
sam z siebie.

## Stara domena zostaje w przekierowaniu

Serwis działał wcześniej pod nazwą Taxen i adresem `taxen.pl`. Cała treść
mówi już Taxun, ale `vercel.json` celowo zna starą nazwę: trzy reguły
przekierowują `taxen.pl`, `www.taxen.pl` i `www.taxun.pl` na `https://taxun.pl`
z zachowaniem ścieżki. To jedyne miejsce w repozytorium, w którym słowo
"taxen" ma prawo stać, i nie wolno go stąd usunąć przy okazji porządkowania -
wraz z regułą znikają linkujące do nas strony i pozycja w wyszukiwarce, którą
przekierowanie stałe przenosi na nowy adres.

Ścieżkę dopasowujemy przez `/:path(.*)`, a nie `/:path*`, i to nie jest
kosmetyka. `/:path*` kompiluje się do wyrażenia, które dopasowuje `/cennik`,
ale **nie** dopasowuje samego `/` - czyli strony głównej, najważniejszego
adresu przy zmianie domeny. `/:path(.*)` łapie oba przypadki. Sprawdzić to
można bez wdrożenia, bo router Vercela leży w `node_modules`:
`getTransformedRoutes` z `@vercel/routing-utils` zwraca gotowe wyrażenia
z `vercel.json`.

Kod odpowiedzi ustawiamy wprost przez `statusCode: 301`, a nie przez
`permanent: true`, bo `permanent` daje 308. Dla samego indeksowania to bez
różnicy (oba są przekierowaniem stałym i przenoszą pozycję), ale narzędzie
"Zmiana adresu" w Search Console szuka dokładnie 301 na stronie głównej starej
domeny i przy 308 kończy się komunikatem, że nie udało się pobrać strony.
Skoro przenosiny z `taxen.pl` mają przejść przez to narzędzie, przekierowanie
musi mówić 301. W testach sprawdzamy więc 301, nie 308.

Sama reguła nie wystarczy. Każda z czterech nazw - `taxen.pl`,
`www.taxen.pl`, `taxun.pl` i `www.taxun.pl` - musi być dopisana do projektu
w panelu Vercela i wskazywać na niego rekordem DNS, inaczej żądanie nie
dotrze tam, gdzie reguła je czeka. Nazwa z rekordem DNS, ale bez wpisu
w projekcie, zrywa połączenie jeszcze przed HTTPS, więc reguła z `vercel.json`
nigdy się nie uruchomi. Tak samo blokuje robota ochrona wdrożenia
(Deployment Protection) i zapora - jeżeli Googlebot dostaje wyzwanie zamiast
odpowiedzi, weryfikacja zmiany adresu widzi to jako brak możliwości pobrania
strony. Kod odpowiada tylko za to, co się dzieje po dotarciu żądania.

## Weryfikacja przed oddaniem pracy

- `npm run build` musi przechodzić.
- `npm run check:assets` musi przechodzić - bez tego hak pre-commit nie
  przepuści commitu.
- Strona sprawdzona w przeglądarce na 390 px i na desktopie, bez poziomego
  scrolla dokumentu.
- Przy zmianach w cenniku: przeklikany kreator na `/wycena` i sprawdzone, że
  nowa pozycja pojawia się w bocznym panelu.
- Przy nowej podstronie z treścią podatkową: sprawdzone, że zastrzeżenie
  pokazuje się dokładnie raz i z właściwą datą.
