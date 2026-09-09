# Kroje źródłowe

Pliki w tym katalogu są **celowo commitowane**. Build nie pobiera niczego
z sieci: gdyby zewnętrzne repozytorium było chwilowo nieosiągalne, deployment
i tak przejdzie.

| plik | krój | wersja | oś zmienna |
| --- | --- | --- | --- |
| `Inter[opsz,wght].ttf` | Inter | 4.001 (`git-66647c0bb`) | `opsz` 14-32, `wght` 100-900 |
| `PlusJakartaSans[wght].ttf` | Plus Jakarta Sans | 2.071 (`gftools 0.9.30`) | `wght` 200-800 |

Pochodzenie: repozytorium [google/fonts](https://github.com/google/fonts),
katalogi `ofl/inter/` i `ofl/plusjakartasans/`.

Licencja: SIL Open Font License 1.1 - pełna treść w `LICENSE-Inter-OFL.txt`
i `LICENSE-PlusJakartaSans-OFL.txt`. Licencja pozwala na hostowanie
i modyfikowanie (w tym obcinanie) plików.

## Co się z nimi dzieje

Nie trafiają na stronę w tej postaci. `scripts/build-fonts.mjs` obcina je do
znaków i funkcji, których serwis używa, zawęża osie do potrzebnych grubości
i zapisuje wynik jako `.woff2` w `src/assets/fonts/`. Ten katalog jest
generowany, ale commitowany - skrypt uruchamia się przed `npm run dev`
i `npm run build`, a gdy odcisk wejścia się nie zmienił, kończy bez pracy.

Efekt: 856 kB + 172 kB źródeł schodzi do 50 kB + 28 kB, które faktycznie
pobiera przeglądarka.

Szczegóły i procedura aktualizacji: [`docs/fonts.md`](../docs/fonts.md).

## Aktualizacja kroju

1. Podmień plik `.ttf` w tym katalogu na nowszy z `google/fonts`.
2. Zaktualizuj wersję w tabeli powyżej i pobierz aktualną treść licencji.
3. `npm run fonts && npm run build && npm run check:fonts`.
   Zacommituj też przebudowane pliki z `src/assets/fonts/`.
4. Przelicz metryki krojów zastępczych w `src/styles/global.css`, jeśli
   zmieniły się metryki kroju - procedura w `docs/fonts.md`.
