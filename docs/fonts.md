# Kroje pisma

Serwis hostuje własne pliki krojów. Nie odwołuje się do `fonts.googleapis.com`
ani `fonts.gstatic.com` - żadna wizyta na stronie nie wysyła danych czytelnika
do Google.

| | |
| --- | --- |
| Tekst | Inter, oś grubości 400-700 |
| Nagłówki | Plus Jakarta Sans, oś grubości 500-800 |
| Pliki źródłowe | `fonts/*.ttf` - commitowane, nic się nie pobiera |
| Pliki wysyłane | `src/assets/fonts/*.woff2` (50 kB + 28 kB) - generowane i commitowane |
| Licencja | SIL Open Font License 1.1, treść w `fonts/` |
| Deklaracje | `@font-face` w `src/styles/global.css` |
| Przygotowanie | `npm run fonts` (samo w sobie, albo automatycznie przed `dev`/`build`) |
| Kontrola zakresu | `npm run build && npm run check:fonts` |
| Kontrola aktualności | `npm run check:assets` |

## Dlaczego nie Google Fonts

Arkusz z `fonts.googleapis.com` blokował pierwsze renderowanie: przeglądarka
musiała rozwiązać DNS i zestawić TLS do obcej domeny, pobrać arkusz, odkryć
w nim adresy plików, zestawić TLS do drugiej domeny (`fonts.gstatic.com`)
i dopiero wtedy pobrać kroje.

Do tego dochodziła objętość. Google dzieli kroje na podzakresy z `unicode-range`,
a polska strona potrzebuje dwóch naraz: `latin` (podstawowa łacina) i `latin-ext`
(ą, ć, ę, ł, ń, ś, ź, ż). Dla samego Intera to 47 kB + 83 kB = **130 kB w dwóch
plikach**. Nasz subset mieści oba zakresy w **jednym pliku 50 kB**, bo wycina
bloki, których serwis nie używa (rozszerzenia fonetyczne, Latin Extended
Additional, warianty stylistyczne ss01-ss08).

## Jak są przygotowane

Pliki źródłowe leżą w `fonts/` i są commitowane. Nic się nie pobiera przy
buildzie - gdyby zewnętrzne repozytorium było chwilowo nieosiągalne,
deployment i tak przejdzie.

`scripts/build-fonts.mjs` uruchamia się przed `npm run dev` i `npm run build`
(przez `prebuild` -> `assets`), dokładnie tak samo jak `optimize-covers.mjs`
przygotowuje zdjęcia. Kolejne kroki:

1. Zawęża osie zmienne do używanych grubości. Inter ma dodatkowo oś `opsz`
   (rozmiar optyczny) - przypinamy ją do domyślnych 14, bo Inter jest tu krojem
   tekstowym, a zachowanie tej osi kosztowało 27 kB.
2. Obcina do zakresu znaków i zestawu funkcji OpenType zdefiniowanych na górze
   skryptu.
3. Kompresuje do `.woff2` i zapisuje do `src/assets/fonts/`.
4. Zapisuje `coverage.json` - listę przedziałów znaków dla kontroli zakresu,
   czytaną wprost z tablicy `cmap` gotowego kroju.

Całość działa na WebAssembly (harfbuzz) i czystym JS (fontverter): bez
natywnych binariów, bez Pythona, bez sieci - czyli w tym samym środowisku,
które daje Vercel.

## Dlaczego gotowe kroje są commitowane

`src/assets/fonts/` leży w repozytorium, tak samo jak warianty zdjęć
(uzasadnienie w [cover-photos.md](cover-photos.md)). Samo obcinanie krojów
trwa ledwie sekundę, więc nie o czas tu chodzi, tylko o to, żeby deployment
przepisywał repozytorium na stronę zamiast odtwarzać po drodze pliki, które
nie zmieniły się od miesięcy - i żeby obie warstwy zasobów działały tak samo.

Jedna różnica wobec zdjęć: pliki źródłowe krojów **są** commitowane, bo ważą
1 MB i aktualizuje się je raz na kilka lat. Oryginały zdjęć, po 2-3 MB na
artykuł i rosnące bez końca, lądują poza gitem.

`coverage.json` trzyma odcisk wejścia: sumę plików źródłowych i wszystkich
decyzji z góry skryptu (zakresy znaków, funkcje OpenType, osie). Powtórne
uruchomienie porównuje odcisk i kończy się natychmiast, jeśli nic się nie
zmieniło. Podmiana `.ttf` albo dopisanie funkcji OpenType daje inny odcisk,
więc kroje powstają od nowa - i trzeba je zacommitować.

`npm run check:assets` niczego nie zapisuje, tylko kończy błędem, gdy commit
nie zawiera aktualnych krojów. Gdyby ktoś zapomniał, dopisze je przebieg
`.github/workflows/assets.yml`, a przy deploymencie i tak zadziała `prebuild`
- w tym wypadku bez zauważalnego kosztu.

## Zakres znaków i jego pilnowanie

Subset obejmuje podstawową łacinę, Latin Extended-A (polskie znaki i reszta
Europy Środkowej), typograficzną interpunkcję, indeksy górne i dolne, waluty,
strzałki, operatory matematyczne, znaczniki i figury geometryczne. Razem
545 znaków.

Znak spoza tego zakresu nie znika - przeglądarka podmienia go na systemowy.
Efekt jest cichy: tekst nadal się wyświetla, tylko jeden znak ma inny rysunek
i inną szerokość. Dlatego `npm run check:fonts` skanuje **zbudowane strony**
(nie źródła, żeby nie łapać znaków z komentarzy w kodzie) i przerywa z listą
znaków, które wypadły poza krój.

Gdy kontrola coś zgłosi, są dwa wyjścia: zamienić znak na taki z zakresu
(zwykle o to chodzi - np. `≥` zamiast `⩾`) albo dopisać przedział do
`UNICODE_RANGES` w `scripts/build-fonts.mjs`. Nowy zakres wchodzi
automatycznie przy najbliższym buildzie.

## Funkcje OpenType

W subsetcie zostają tylko te funkcje, których serwis używa:

- `cv02`, `cv03`, `cv04`, `cv11` - warianty znaków Intera ustawiane w
  `global.css` przez `font-feature-settings`. Bez nich litery `a`, `g`, `l`, `1`
  wyglądałyby inaczej niż dotąd.
- `tnum` - cyfry tabelaryczne (`font-variant-numeric: tabular-nums`).
- `kern`, `liga`, `calt`, `ccmp`, `locl`, `mark` - podstawy składu.

Reszta (`ss01`-`ss08`, `dlig`, `salt`, `aalt`) odpada i oszczędza ~13 kB.
Jeśli w CSS pojawi się nowa funkcja, trzeba ją dopisać do `LAYOUT_FEATURES`
w `scripts/build-fonts.mjs` - inaczej po prostu nie zadziała.

Uwaga: domyślna lista harfbuzza nie zawiera wariantów `cv*`, więc skrypt
czyści zbiór funkcji i wpisuje własny. Gotowe biblioteki opakowujące
subsetter zwykle zostawiają wszystkie funkcje, co dawało pliki o 13 kB
większe - stąd bezpośrednie użycie harfbuzza.

## Kroje zastępcze z dopasowanymi metrykami

`font-display: swap` pokazuje tekst natychmiast krojem systemowym i podmienia
go, gdy dojedzie właściwy. Problem w tym, że krój systemowy ma inne proporcje:
w momencie podmiany akapity zmieniały wysokość i treść podskakiwała. Zmierzone
CLS wynosiło 0,049, a na liście artykułów chipy kategorii łamały się na cztery
rzędy zamiast trzech i przesuwały stronę o 50 px.

Dlatego `global.css` deklaruje `Inter Fallback` i `Plus Jakarta Sans Fallback` -
kroje systemowe z nadpisanymi metrykami:

| | size-adjust | ascent | descent |
| --- | --- | --- | --- |
| Inter Fallback | 106,5% | 90,96% | 22,65% |
| Plus Jakarta Sans Fallback | 101,4% | 102,37% | 21,89% |

`size-adjust` pochodzi ze zmierzonej szerokości reprezentatywnego polskiego
tekstu względem Ariala; nadpisania pionowe to metryki naszych plików podzielone
przez `size-adjust` (procenty odnoszą się do em już przeskalowanego).

Lista `local()` obejmuje Arial, Roboto, Helvetica, Arimo i Liberation Sans -
wszystkie mają praktycznie identyczne szerokości znaków, więc jedna wartość
obsługuje Windowsa, macOS-a, Androida, ChromeOS-a i Linuksa. Gdy nie ma
żadnego, przeglądarka bierze kolejny krój z listy: bez dopasowania, ale
poprawnie.

Po zmianie wersji kroju warto te liczby przeliczyć - inaczej dopasowanie
przestaje pasować.

## Wczytywanie

`BaseLayout.astro` robi `preload` **tylko Intera**. To krój tekstu i interfejsu,
więc to on decyduje o układzie strony; nagłówkowy Plus Jakarta Sans dociąga się
zwykłą ścieżką i pilnują go metryki zastępcze.

Preload obu plików naraz pogarszał sprawę: 79 kB rywalizowało o pasmo z CSS-em
i pierwsze renderowanie przesuwało się o ~100 ms. Pomiary (390x844, Slow 4G,
CPU x4, mediana z trzech przebiegów):

| wariant | FCP `/wiedza` | FCP artykuł | CLS |
| --- | --- | --- | --- |
| preload obu + metryki | 1384 ms | 1428 ms | 0 |
| bez preloadu + metryki | 1072 ms | 1032 ms | 0,021 |
| **preload Intera + metryki** | **1328 ms** | **1304 ms** | **0** |

Atrybut `crossorigin` przy `preload` jest wymagany także przy własnej domenie:
fonty pobiera się zawsze w trybie CORS, a bez niego przeglądarka pobrałaby plik
drugi raz.

Nazwy plików dostają odcisk treści od Vite (`inter-variable-latin.l7zTUXHq.woff2`),
więc `vercel.json` cache'uje katalog `/assets/` bezterminowo.
