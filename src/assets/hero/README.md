# Zdjęcie w hero na stronie głównej

Wrzuć tu jeden plik `.jpg`, `.png`, `.webp` albo `.avif`. Zostanie użyty
automatycznie - `src/data/hero-photo.ts` znajduje go po wzorcu, więc nie trzeba
niczego importować ani przełączać w komponencie. Dopóki katalog jest pusty
(sam README się nie liczy), hero pokazuje wariant zapasowy z panelem.

Czego potrzebuje kadr:

- **Proporcja 4:5 (pionowa).** Ramka ma `aspect-ratio: 4 / 5` i przycina
  zdjęcie przez `object-fit: cover`, więc szeroki kadr straci boki.
- **Co najmniej 1000 px szerokości.** Na ekranie 2x ramka ma około 840 px.
  Większy plik nie szkodzi - Astro i tak składa z niego mniejsze warianty.
- **Ciemniejsza, spokojna dolna część.** Na dole leży przyciemnienie pod chipy,
  a hero jest granatowe: zdjęcie z jasnym, zajętym dołem będzie się gryzło.
- **Prawa do użycia.** Własne zdjęcie biura albo zespołu, ewentualnie stock
  z licencją komercyjną. Nie wrzucamy tu niczego znalezionego w wyszukiwarce.

Po podmianie pliku popraw `heroPhotoAlt` w `src/data/hero-photo.ts` - opis ma
mówić, co widać na zdjęciu.

Oryginałów zdjęć artykułów nie commitujemy (patrz `docs/cover-photos.md`), ale
to zdjęcie jest wyjątkiem świadomym: nie przechodzi przez `npm run covers`,
tylko przez potok obrazów Astro, więc plik źródłowy musi leżeć w repozytorium.
