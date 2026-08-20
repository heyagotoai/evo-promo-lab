# Plan: LLM do wprowadzania danych, badań nad skutecznością i podsumowań

Dokument planistyczny, nie implementacja. Opisuje, jak dopiąć model językowy do istniejącego
laboratorium, nie psując tego, co stanowi jego wartość.

**Model:** Gemini 3.5 Flash-Lite.
**Status:** plan zatwierdzony do realizacji etapami, kod jeszcze nie napisany.

---

## 0. Zasada nadrzędna

Cała wartość tego narzędzia siedzi w zdaniu: *każda liczba jest wyliczona z Twoich danych albo
jawnie oznaczona jako DOMYŚLNA*. Model językowy, który oszacuje elastyczność, kasuje tę wartość
jednym zdaniem — bo „elastyczność lodów budżetowych to zwykle około 2,5" brzmi wiarygodnie
i jest zmyślone.

> **Granica: LLM obsługuje język i sytuację. Kod obsługuje arytmetykę i przeszukiwanie.**

Wszystko poniżej jest konsekwencją tej jednej linii. Trzy zakazy, które z niej wynikają i których
nie wolno obejść bez zmiany tego dokumentu:

1. **LLM nie produkuje żadnej liczby, która trafia do modelu symulacji.** Może wskazać liczbę
   w dokumencie użytkownika. Nie może jej wymyślić, uśrednić ani „oszacować z branży".
2. **LLM nie generuje kalendarza promo.** Przestrzeń to 9⁴⁸; szukanie planu zostaje przy
   algorytmie ewolucyjnym, który daje powtarzalność przy tym samym ziarnie i gwarancję
   legalności przez funkcję naprawczą.
3. **LLM nie formatuje kwot do prezentacji własnymi słowami.** Liczby renderuje kod
   (`planReport()` w `src/lib/exportPlan.ts`).

---

## 1. Wybór modelu i co z niego wynika

Gemini 3.5 Flash-Lite jest pozycjonowany do klasyfikacji, routingu, **ekstrakcji danych**
i lekkich przepływów agentowych. To trafiony wybór do etapu 1 i akceptowalny do etapu 3.
Do etapu 2 (pętla badawcza) jest to najsłabsze ogniwo planu — dlatego etap 2 jest zaprojektowany
tak, żeby model podejmował jak najmniej decyzji, a liczyły narzędzia.

| Cecha | Wartość | Źródło |
|---|---|---|
| Identyfikator modelu | `gemini-3.5-flash-lite` (Google AI API); `google/gemini-3.5-flash-lite` w OpenRouter | **do potwierdzenia** — patrz niżej |
| Okno kontekstu | 1 048 576 tokenów | agregatory |
| Maks. wyjście | 65 536 tokenów | agregatory |
| Wejście | tekst, obrazy, wideo, audio, pliki (w tym PDF) | agregatory |
| Structured output (schemat JSON) | tak | agregatory |
| Function calling | tak | agregatory |
| Cache kontekstu | tak | agregatory |
| Cena | ok. **0,30 USD / 1 mln wejścia**, **2,50 USD / 1 mln wyjścia** | **do potwierdzenia w cenniku Google** |

> **Zadanie zerowe przed pierwszą linią kodu:** potwierdzić dokładny identyfikator modelu, limity
> i cennik w oficjalnej dokumentacji Google (`ai.google.dev/gemini-api/docs/models`). Powyższe
> pochodzi z agregatorów, bo domena Google jest zablokowana z środowiska, w którym powstał ten
> dokument. Nie kopiować tych liczb do kodu ani do oferty bez sprawdzenia u źródła — to dokładnie
> ten rodzaj „brzmi wiarygodnie", przed którym broni całe narzędzie.

**Multimodalność jest tu kluczowa, nie ozdobna.** Raporty sell-out i plany gazetkowe przychodzą
jako PDF-y i zrzuty ekranu. Model przyjmujący pliki i obrazy usuwa ręczne przepisywanie —
czyli to, co dziś zajmuje najwięcej czasu przed pierwszym policzonym planem.

---

## 2. Etap 1 — wprowadzanie danych (priorytet, robimy pierwsze)

### Problem

Doradca (`/#/doradca`) ma ok. 25 pól. Kategoria manager ma te dane w mailu, w arkuszu sell-out
i w planie gazetkowym sieci. Przepisywanie ręczne jest tym, co powstrzymuje przed użyciem
narzędzia w realnej pracy.

### Co robi LLM

Czyta dokument (PDF, arkusz, zrzut ekranu, wklejony tekst) i **proponuje wartości pól formularza**.
Nic nie liczy. Mapuje tekst na strukturę.

### Kontrakt danych

Wyjście modelu jest wymuszone schematem JSON odpowiadającym typowi `Situation`
(`src/lib/advisor.ts:65`), rozszerzonym o pole źródła przy każdej wartości:

```
{
  pole: "observations[0].promoWeek1",
  wartosc: 9500,
  cytat: "tydz. 24 — Flirt 1+1 — 9 500 szt.",   // dosłowny fragment dokumentu
  lokalizacja: "str. 2, tabela 'Sell-out tygodniowy'",
  pewnosc: "wysoka" | "niska"
}
```

Pole bez znalezionego pokrycia w dokumencie **zostaje puste**. Model nie ma prawa zwrócić wartości
bez cytatu — brak cytatu jest błędem walidacji po stronie serwera, a nie sygnałem do ponowienia
zapytania z luźniejszym promptem.

### Co widzi użytkownik

Ekran potwierdzenia przed wypełnieniem formularza: każda proponowana liczba obok fragmentu
źródła, z którego pochodzi. Użytkownik akceptuje całość, pojedyncze pola albo odrzuca. Dopiero
zaakceptowane wartości trafiają do `Situation` i dalej do `advise()`.

### Dlaczego to jest bezpieczne

Zabezpieczenia napisane przeciw ludzkim literówkom działają tak samo dobrze przeciw błędom
ekstrakcji. `advise()` już dziś zgłasza: akcję bez wzrostu sprzedaży, elastyczność poza skalą,
kanibalizację powyżej 100%, trzeci tydzień mocniejszy od pierwszego, koszt wytworzenia powyżej
ceny, kotwicę, która nie jest najdroższa za litr. Źle odczytana liczba z tabelki wpada w te same
sita. **Nie trzeba budować osobnej warstwy walidacji — trzeba jej nie omijać.**

### Kryteria wyjścia z etapu

- ≥ 90% trafności pól na zestawie ewaluacyjnym (patrz sekcja 6)
- zero pól zwróconych bez cytatu
- czas od wrzucenia dokumentu do wypełnionego formularza < 30 s
- ścieżka bez LLM (ręczne wypełnianie) działa bez zmian

---

## 3. Etap 2 — badania nad skutecznością (operator)

### Problem

Optymalizator odpowiada na brief, który mu się poda. Wartość bierze się z **zadania właściwego
pytania**, a tego nie da się wyklikać formularzem. Przykład z prawdziwej sesji: dopiero
porównanie trzech briefów pokazało, że *utrzymanie dzisiejszego wolumenu kosztuje ok. 77 tys. zł
marży, a poluzowanie progu odzyskuje większość z tego*. Formularz tego nie powie.

> **LLM nie szuka planu — szuka właściwego pytania.** Plan znajduje algorytm ewolucyjny,
> którym LLM steruje jak analityk sterowałby arkuszem.

### Narzędzia

Warstwa liczbowa jest już gotowa jako zestaw czystych funkcji bez stanu i bez UI. Nie trzeba nic
przepisywać — trzeba opisać ich schematy:

| Narzędzie | Funkcja | Plik |
|---|---|---|
| `policz_plan` | `runOptimizer` | `src/lib/optimize.ts:448` |
| `oceń_plan` | `evaluate` | `src/lib/optimize.ts` |
| `sprawdź_reguły` | `auditPlan` | `src/lib/optimize.ts` |
| `test_odporności` | `stressTest` | `src/lib/robust.ts:124` |
| `progi_opłacalności` | `breakEvenElasticity` | `src/lib/lines.ts` |
| `wylicz_parametry` | `advise` | `src/lib/advisor.ts:285` |

### Co bada

Zestaw badań uruchamianych na jednym scenariuszu:

1. **Ile kosztuje każdy próg.** Puść ten sam scenariusz z progiem wolumenu i bez, z twardym
   limitem łańcucha i bez. Różnica w marży to cena zobowiązania — liczba, którą warto znać przed
   rozmową z siecią.
2. **Gdzie leży granica opłacalności.** Przesuwaj próg wolumenu, aż marża spadnie poniżej
   dzisiejszej. Ten punkt to maksymalny wolumen, jaki opłaca się obiecać.
3. **Które reguły są drogie.** Poluzuj po kolei każdą regułę handlową i zmierz zysk. Reguła,
   która nic nie kosztuje, jest darmowym bezpieczeństwem; reguła kosztująca 80 tys. zł to temat
   na rozmowę z zarządzającym marką, a nie cichy parametr.
4. **Czy wynik przeżywa niepewność.** `stressTest` na najlepszym kandydacie plus tabela
   „co zmierzyć najpierw", spięta z listą braków z Doradcy.

### Ograniczenia wynikające z wyboru modelu

Flash-Lite to model do lekkich przepływów agentowych, nie do długiej autonomicznej pętli.
Konsekwencje projektowe, nieopcjonalne:

- **Twardy limit tur** (proponowane: 12) i twardy limit wywołań `policz_plan` (proponowane: 8).
  Przekroczenie kończy badanie i oddaje to, co zebrano.
- **Scenariusze badań są z góry zdefiniowane w kodzie**, nie wymyślane przez model. Model wybiera,
  które z nich uruchomić i z jakimi wartościami progów — nie projektuje eksperymentu od zera.
- **Każde wywołanie narzędzia jest logowane z ziarnem losowym**, żeby całe badanie dało się
  odtworzyć bez LLM-a.
- **LLM nie ma dostępu do zapisu.** Narzędzia są tylko do odczytu i liczenia; zapis scenariusza
  zostaje decyzją użytkownika.

### Kryteria wyjścia z etapu

- badanie kończy się w limicie tur w ≥ 95% uruchomień
- każda liczba w wynikach ma odpowiadające jej wywołanie narzędzia w logu
- powtórzenie badania z tym samym ziarnem daje te same liczby (tekst może się różnić)

---

## 4. Etap 3 — podsumowanie wyników

### Co robi LLM

Zamienia wynik badania w kilka akapitów po polsku: co znaleziono, ile to warte, co jest
niepewne, co zrobić dalej.

### Zasada twarda

**Wejściem podsumowania są wyłącznie liczby zwrócone przez narzędzia.** Model nie ma prawa
podać liczby, której nie ma w wyniku wywołania. Weryfikacja: automatyczne wyłuskanie wszystkich
liczb z wygenerowanego tekstu i porównanie ze zbiorem liczb z logu narzędzi. Liczba spoza zbioru
blokuje publikację podsumowania i jest zgłaszana jako błąd, nie poprawiana po cichu.

### Czego podsumowanie musi zawsze dotknąć

- przewaga nad dzisiejszym planem **i** jej odporność (nie sama mediana)
- ile odczytów jest zmierzonych, a ile domyślnych — z wnioskiem, czy wolno pokazywać kwoty
  bezwzględne, czy tylko ranking wariantów
- pierwszy pomiar z tabeli „co zmierzyć najpierw"
- zdanie o tym, czego model nie zna: listing, ekspozycja, akcje konkurencji, dopłaty sieci

### Gdzie trafia

Do sekcji raportu `planReport()`, obok istniejących tabel — jako **komentarz do liczb, nigdy
zamiast nich**. Raport bez podsumowania ma dalej działać.

---

## 5. Architektura

### Backend jest konieczny

Dziś to statyczny front na Vercelu. Klucz API nie może trafić do przeglądarki, więc dochodzi
funkcja serwerowa (Vercel Functions). Trzy endpointy, jeden na etap:

| Endpoint | Wejście | Wyjście |
|---|---|---|
| `POST /api/wczytaj` | dokument (PDF / obraz / tekst) | propozycje pól z cytatami |
| `POST /api/badaj` | `Situation` + zakres badania | log wywołań narzędzi + wyniki |
| `POST /api/podsumuj` | log wywołań + wyniki | tekst podsumowania |

### Warstwa LLM jest dodatkiem, nie warunkiem działania

Narzędzie działa dziś w całości w przeglądarce, bez sieci. To trzeba utrzymać: **przy
niedostępnym API wszystkie trzy ścieżki mają się wyłączyć, a formularz, optymalizator i eksport
działać bez zmian.** Żaden przycisk warstwy LLM nie może być jedyną drogą do funkcji, która
istnieje dziś.

### Czego nie robimy

- **Nie idziemy w platformę agentową z hostowanym kontenerem.** Narzędzia to czyste funkcje
  z `src/lib/` — hostowany sandbox z bashem byłby młotem na muchę.
- **LLM nie wchodzi do pętli optymalizacji.** Algorytm ewolucyjny liczy 60 pokoleń w ok. 200 ms,
  tura modelu to sekundy. Model stoi wokół pętli, nigdy w środku.

---

## 6. Testowanie

Dziś 104 testy przechodzą, bo wszystko jest deterministyczne. Warstwa LLM taka nie jest i **nie
może się wpleść w ścieżkę, którą testujemy jednostkowo**.

| Warstwa | Sposób testowania |
|---|---|
| Model, optymalizator, doradca, odporność, eksport | bez zmian — 104 testy deterministyczne, CI na każdym PR |
| Ekstrakcja (etap 1) | osobny zestaw ewaluacyjny: kilkanaście prawdziwych dokumentów z ręcznie ustaloną prawdą; mierzona trafność pól i odsetek pól bez cytatu |
| Badania (etap 2) | zestaw scenariuszy z oczekiwanym wnioskiem jakościowym (np. „ma zauważyć, że próg wolumenu jest kosztowny"); mierzony odsetek trafień i liczba tur |
| Podsumowanie (etap 3) | automatyczne sprawdzenie, że każda liczba w tekście pochodzi z logu narzędzi — to test binarny, nie ocena stylu |

Bez własnych zestawów ewaluacyjnych po trzech miesiącach nikt nie będzie wiedział, czy warstwa
językowa się nie zepsuła. To nie jest opcjonalne rozszerzenie planu.

---

## 7. Koszt i latencja

Ładunki są małe: `Situation` to kilka kilobajtów, log badania kilkanaście. Przy cenach rzędu
0,30 / 2,50 USD za milion tokenów typowa sesja to grosze — **dominującym kosztem jest wejście
multimodalne** (skan PDF-a waży dużo więcej niż formularz) oraz liczba tur w etapie 2.

Metoda szacowania przed wdrożeniem, zamiast zgadywania: policzyć tokeny na pięciu prawdziwych
dokumentach, przemnożyć przez potwierdzony cennik, pomnożyć przez zakładaną liczbę sesji
tygodniowo. Do budżetu wpisać wynik tego rachunku, nie liczby z tego dokumentu.

Latencja: etap 1 poniżej 30 s, etap 3 poniżej 15 s, etap 2 może trwać minuty — dlatego etap 2
musi pokazywać postęp i dać się przerwać.

---

## 8. Ryzyka

| Ryzyko | Jak łagodzone |
|---|---|
| Model odczyta liczbę z niewłaściwej kolumny | cytat obok każdej wartości + ekran potwierdzenia + istniejące sita w `advise()` |
| Model „pomoże" i uzupełni brakującą daną | brak cytatu = błąd walidacji, wartość odrzucana po stronie serwera |
| Podsumowanie zawiera liczbę spoza wyników | automatyczne porównanie liczb z tekstu z logiem narzędzi; blokada publikacji |
| Pętla badawcza się nie zbiega (słabszy model) | twarde limity tur i wywołań, gotowe scenariusze zamiast projektowania eksperymentu |
| Zależność zewnętrzna psuje działające narzędzie | warstwa LLM w pełni opcjonalna, wyłączalna, bez ścieżek jednokierunkowych |
| Wyciek klucza API | klucz wyłącznie w funkcji serwerowej, nigdy w bundlu przeglądarki |
| Dane handlowe wychodzą do dostawcy modelu | **do rozstrzygnięcia przed etapem 1**: co wolno wysłać, czy potrzebna anonimizacja nazw sieci i kontrahentów, jakie są ustalenia o retencji |

---

## 9. Kolejność prac

1. **Zadanie zerowe.** Potwierdzić identyfikator modelu, limity i cennik u źródła. Rozstrzygnąć
   kwestię danych handlowych z sekcji 8.
2. **Etap 1 wąsko** — jeden typ dokumentu (raport sell-out), ekstrakcja z obowiązkowym cytatem,
   ekran potwierdzenia, zestaw ewaluacyjny. To najmniejszy zakres, który realnie skraca drogę od
   „mam raport" do „mam plan".
3. **Etap 3** — podsumowanie z twardą weryfikacją liczb. Tanie, a od razu użyteczne przy eksporcie.
4. **Etap 2** — pętla badawcza. Najciekawszy, ale ma sens dopiero, gdy dane wchodzą szybko:
   inaczej optymalizuje się brief na parametrach, których nikomu nie chciało się wpisać.

### Uwaga o priorytetach

Warstwa LLM przyspiesza **wprowadzanie danych**. Nie zwiększa wiarygodności wyniku — tę
podnoszą pomiary i test odporności. Jeśli zasób jest jeden, pomiar rzeczywistych parametrów
z tabeli „co zmierzyć najpierw" bije każde usprawnienie interfejsu.
