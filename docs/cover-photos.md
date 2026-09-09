# Zdjęcia wyróżniające artykułów (cover photo)

Artykuł może mieć zdjęcie wyróżniające. Jest opcjonalne: bez niego karta na
liście i hero artykułu wyglądają dokładnie tak, jak dotąd - z gradientem
i plakietką kategorii.

## Jak dodać zdjęcie

1. Wrzuć plik do `public/posts/`, np. `public/posts/najem-prywatny.jpg`.
   Katalog jest płaski - bez podkatalogów.
2. W nagłówku artykułu (`src/content/blog/*.md`) podaj samą nazwę pliku:

   ```yaml
   cover: "najem-prywatny.jpg"
   ```

3. Uruchom `npm run covers` (albo `npm run dev` od nowa). Skrypt zakoduje
   komplet plików i **przeniesie oryginał do `.originals/`** - katalogu poza
   gitem, który zostaje na Twoim dysku.
4. Zacommituj to, co powstało w `public/posts/_optimized/`, razem z manifestem.
   Hak pre-commit nie przepuści commitu, w którym czegoś brakuje.

Oryginał nie trafia do repozytorium i nie ma takiej potrzeby: żaden czytelnik
go nie pobiera. Trzymaj `.originals/` razem z resztą materiałów - to jedyna
kopia, z której da się kiedyś przekodować komplet z innymi ustawieniami.

To jedno pole wystarcza. Zdjęcie pojawia się wszędzie, gdzie jest potrzebne:
na liście artykułów, w archiwach kategorii i autora, w hero artykułu, jako
obrazek Open Graph przy udostępnianiu i w danych strukturalnych `Article`.

### Opis alternatywny

Domyślnie zdjęcie jest traktowane jako dekoracja - leży obok tytułu, więc
czytnik ekranu nie powtarza tej samej treści dwa razy. Jeśli zdjęcie coś
przekazuje (schemat, zrzut ekranu, wykres), opisz je:

```yaml
cover: "kalkulacja-vat.png"
coverAlt: "Porównanie rozliczenia VAT przy najmie mieszkania i lokalu użytkowego"
```

## Jakie zdjęcie przygotować

| | |
| --- | --- |
| Szerokość | co najmniej 1600 px (mniejsze będą rozmyte na ekranach 2x) |
| Proporcja | poziome, blisko 3:2 - kadr hero artykułu ma dokładnie tyle |
| Format | JPG, PNG, WebP albo AVIF |
| Rozmiar pliku | bez znaczenia - i tak przekodowujemy; nie warto kompresować "na zapas" |

Kadr jest przycinany od środka (`object-fit: cover`), a w różnych miejscach ma
różne proporcje. Na karcie wyróżnionego artykułu zdjęcie zajmuje wąską, wysoką
kolumnę, więc najważniejszy element trzymaj bliżej środka zdjęcia.

Do udostępnień (Facebook, LinkedIn) powstaje osobny kadr 1200x630, ale tylko
wtedy, gdy oryginał ma co najmniej 600 px szerokości - węższego nie ma sensu
powiększać do kadru, więc wtedy zostaje domyślna grafika `og-image.png`.

## Co powstaje z jednego zdjęcia

Astro optymalizuje tylko obrazy importowane z `src/`; pliki z `public/` kopiuje
bez zmian. `scripts/optimize-covers.mjs` nadrabia różnicę i zapisuje do
`public/posts/_optimized/`:

| plik | po co |
| --- | --- |
| AVIF i WebP, 320-1600 px | to pobiera przeglądarka - jeden plik, zwykle 5-50 kB |
| `...-fallback.jpg`, 960 px | `<img src>` dla przeglądarek bez AVIF i bez WebP |
| `...-og.jpg`, 1200x630 | podgląd linku na Facebooku, LinkedInie, w Slacku |

Kadr Open Graph jest osobnym plikiem, bo serwisy oczekują proporcji 1,91:1.
Pionowe zdjęcie artykułu przycięłyby po swojemu, zwykle przez środek kadru.

W nazwie każdego pliku siedzi skrót treści oryginału
(`nazwa.1d1c3a3d-640.avif`), dlatego wszystko jest cache'owane bezterminowo
(`immutable` w `vercel.json`), a podmiana zdjęcia pod tą samą nazwą i tak
natychmiast dociera do czytelników.

## Dlaczego oryginał nie jest commitowany

Zdjęcie ze stocka ma 4000-6700 px i waży 2-3 MB, a serwis wysyła najwyżej
1600 px. **Żaden czytelnik nigdy nie pobiera oryginału** - `<picture>` zawsze
trafia w wariant AVIF albo WebP. Trzymanie go w repozytorium kosztowało 2,1 MB
na artykuł za plik, który nie wychodzi na łącze.

Do tego dochodził czas. Dopóki `public/posts/_optimized/` był w `.gitignore`,
każdy deployment kodował wszystkie zdjęcia od nowa: przy dziesięciu artykułach
5 min 43 s przed pierwszą linijką właściwego builda, i coraz więcej z każdym
kolejnym zdjęciem.

Teraz jest odwrotnie. W repozytorium leży wyłącznie to, co ktoś pobiera,
oryginał zostaje na dysku autora, a deployment niczego nie koduje - sprawdza
tylko, czy komplet się zgadza:

| | przed | po |
| --- | --- | --- |
| repozytorium na artykuł | 2,94 MB | ~1,0 MB |
| deployment, bez zmian w zdjęciach | 5 min 43 s | poniżej sekundy |
| deployment, jedno nowe zdjęcie | 5 min 43 s | poniżej sekundy |
| `og:image` | 4000x6000, 2,7 MB | 1200x630, ~65 kB |

## Manifest jest źródłem prawdy

`public/posts/_optimized/manifest.json` trzyma dla każdego zdjęcia skrót treści
oryginału, jego wymiary i listę plików, które powinny istnieć. Dzięki temu na
czystym klonie - bez jednego oryginału - da się sprawdzić, czy commit jest
kompletny.

| sytuacja | co robi `npm run covers` |
| --- | --- |
| nic się nie zmieniło | nic, kończy poniżej sekundy |
| nowe zdjęcie w `public/posts/` | koduje komplet, przenosi oryginał do `.originals/` |
| podmienione zdjęcie | inny skrót, więc nowy komplet; stare pliki kasuje |
| brakujący plik, oryginał w `.originals/` | odtwarza go |
| brakujący plik, oryginału nie ma | **błąd** - nie ma z czego odtworzyć |

Ostatni wiersz jest celowy. Skoro oryginałów nie ma ani w CI, ani na Vercelu,
brak pliku musi być głośnym błędem, a nie cichym sześciominutowym kodowaniem.

Zdjęcie wycofuje się jawnie:

```
npm run covers -- --forget stare-zdjecie.jpg
```

Skrypt kasuje pliki, usuwa wpis i odstawia oryginał do `.originals/_wycofane/`
- bez tego następne uruchomienie znalazłoby go w archiwum i odtworzyło komplet.
Samo z siebie nic się nie kasuje; skrypt tylko wypisuje, których zdjęć nie
używa już żaden artykuł, bo zdjęcie bywa gotowe wcześniej niż tekst.

## Co pilnuje kompletności

`npm run check:assets` sprawdza jedno i drugie (zdjęcia i kroje), niczego nie
zapisując. Kończy błędem, gdy w `public/posts/` czeka nieprzetworzone zdjęcie,
gdy brakuje pliku z manifestu, gdy w katalogu leży coś nieużywanego albo gdy
manifest jest nieaktualny.

Uruchamiają to dwie rzeczy:

- **hak pre-commit** (`.githooks/pre-commit`) - włącza go `npm install`
  (skrypt `prepare` ustawia `core.hooksPath`). Pojedynczy commit można
  przepuścić przez `git commit -n`.
- **przebieg `.github/workflows/assets.yml`** - łapie commity zrobione
  z pominięciem haka: przez `-n`, przez interfejs GitHuba albo ze świeżego
  klonu bez `npm install`.

## Kiedy build się wywali

Literówka w nazwie pliku przerywa budowanie z komunikatem wskazującym artykuł
i listę dostępnych zdjęć. To celowe: przy cichym pominięciu artykuł wygląda
poprawnie, tylko zamiast zdjęcia zostaje gradient - i nikt tego nie zauważa aż
do publikacji.

Jeśli komunikat mówi, że plik leży w `public/posts/`, ale nie został
przetworzony, uruchom `npm run covers`. Jeśli mówi, że zdjęcia nie ma
w manifeście, to znaczy, że nikt go nigdy nie przetworzył albo zostało wycofane
- wrzuć oryginał z `.originals/` do `public/posts/` i uruchom skrypt.

## Wydajność na telefonie

Wersja mobilna listy i artykułu jest mierzona przy dławionym łączu (Slow 4G:
1,6 Mb/s, 150 ms opóźnienia) i procesorze spowolnionym czterokrotnie, na
ekranie 390x844 przy `deviceScaleFactor: 3`:

| | lista `/wiedza` | artykuł ze zdjęciem |
| --- | --- | --- |
| FCP / LCP | ~1,27 s | ~1,35 s |
| CLS | 0 | 0 |
| transfer | 214 kB | 235 kB |
| w tym kroje pisma | 79 kB | 79 kB |
| pobrane zdjęcie | 5 kB AVIF (960w) | 5 kB AVIF (960w) |

Kroje są hostowane u nas i cache'owane bezterminowo, więc te 79 kB płaci
wyłącznie pierwsze wejście na serwis - szczegóły w [fonts.md](fonts.md).

Elementem LCP jest nagłówek tekstowy, nie zdjęcie - kadr ma stałą proporcję
w CSS, więc obraz dogrywa się bez przesuwania treści (stąd CLS równe zeru).

Przewijanie mierzone przy procesorze spowolnionym sześciokrotnie: mediana
klatki 17 ms (60 fps), zero klatek dłuższych niż 50 ms.
