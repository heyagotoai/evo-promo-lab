# Laboratorium promocji i ewolucji

Interaktywne przykłady: od najprostszego algorytmu genetycznego, przez trasę i dzień handlowca, po kalendarz promo czterech linii lodów (Euforia, Retro, Pycha, Flirt).

Liczby (COGS, popyt, elastyczność) są **syntetyczne** — do kręcenia gałkami, nie do listingu.

**Wykonawca dokumentacji:** Marcin Szczęsny

## Adresy

- Aplikacja: https://evo-promo-lab.vercel.app
- Kod: https://github.com/heyagotoai/evo-promo-lab

HashRouter: `/#/linie` · `/#/handlowiec` · `/#/trasa` · `/#/onemax`

## Lokalnie

```bash
npm install
npm run dev
```

## Co jest zaimplementowane

### OneMax (`/#/onemax`)

Klasyczny **algorytm genetyczny** na łańcuchu 20 bitów. Fitness = liczba jedynek.

- selekcja: turniej k=3
- krzyżowanie: jednopunktowe (opcjonalnie wyłączane)
- mutacja: bit flip z zadanym p
- elityzm: 2 najlepsze osobniki bez zmian

Cel dydaktyczny: pokazać, że populacja + selekcja + szum znajdują optimum, gdy krajobraz jest gładki.

### Kolejność wizyt (`/#/trasa`)

**TSP** (komiwojażer): 7 obowiązkowych punktów, start i koniec w biurze. Genom = permutacja. Fitness = czas trasy (euklides × 0,25).

- krzyżowanie OX (order crossover)
- mutacja: zamiana dwóch miast
- elityzm
- baseline: zachłanny najbliższy sąsiad
- optimum: brute force 7! = 5040 — da się policzyć w przeglądarce

### Dzień handlowca (`/#/handlowiec`)

**Orienteering / prize-collecting TSP**: 11 sklepów, budżet 6 godzin, nie da się wszędzie. Genom = kolejność priorytetów. Dekoder **pomija** punkt, jeśli dojazd + wizyta + powrót do hurtowni przekracza 360 min. Fitness = oczekiwane zł zamówień, nie kilometry.

- OX + swap, elityzm
- baseline: zachłanny najbliższy oraz zachłanny najwyższy kontrakt
- pułapka: festiwal 9800 zł / 70 min vs korytarz plażowy

### Cztery linie lodów (`/#/linie`) — to nie jest GA

Porównanie **gotowych presetów rotacji** (chroń premium, 1 po 1, Flirt+Euforia, Retro+Pycha, tylko Flirt, wszystkie naraz) na symulacji 12 tygodni.

W modelu: elastyczność, kanibalizacja sąsiadów (głównie Retro–Pycha), zmęczenie fali, dołek spiżarni (silniejszy przy gratis), COGS także na darmowych kubkach, limit łańcucha w **litrach albo kartonach**. Ceny regularne i wytworzenie są edytowalne.

Kartony: Euforia 6, Retro 6, Pycha 4, Flirt 8 szt.

## Jak oceniać parametry (linie lodów)

Ustawiaj tak, żeby opisywały rynek, nie wykres.

| Parametr | Jak ocenić |
|---|---|
| **Sezon** | Kalendarz i pogoda, nie głębokość gazetki. Deszcz / poza sezonem ×0,7; upał ×1,4. Skaluje wszystkie linie naraz. |
| **Kanibalizacja** | Czy po promo jednej linii spada sąsiadka w tym samym sklepie. Retro ↔ Pycha zwykle wysoka; Euforia ↔ Flirt niska. |
| **Zmęczenie fali** | Tydzień 1 vs tydzień 3 tej samej naklejki. Lift pada → ostre. Gazetka się nie nudzi → słabe. |
| **Dołek po promo** | Czy tydzień po akcji lodówka klienta jest pełna. Gratis (zwłaszcza 2+2) głębszy niż %. Sell-out wraca od razu → płytki. |
| **Elastyczność** | Ile sztuk dochodzi na % zniżki. Flirt / dyskont = łowcy; Euforia = twardszy popyt. Gałka skaluje lift całości. |
| **Limit łańcucha** | Z logistyki. Litry gdy mroźnia liczy L; kartony gdy paleta. Ustaw sufit, w który zwykle uderzacie — nie średni tydzień. |
| **Cena i wytworzenie** | Cennik i kalkulacja. Marża sztukowa = regularna − COGS. Gratis zjada ją darmowymi kubkami. COGS > cena → minus już bez gazetki. |
| **Długość fali** | 2–3 tygodnie to norma. 6 tygodni pokazuje, jak zmęczenie zjada marżę. Po fali zostaw ciszę. |
| **Mechanika** | % gdy nie chcesz zapychać mroźni. 1+1 / 2+1 gdy litry. 2+2 = max 50% w litrach + najgłębsza spiżarnia. Euforii prawie nigdy −50% ani 2+2. |

## Czego tu nie ma — i co by się zmieniło

| Zamiast | Kiedy warto | Co innego zobaczysz |
|---|---|---|
| **Wspinaczka / SA** na OneMax | Krajobraz bez oszustw (każda jedynka pomaga) | Hill-climb znajdzie 20/20 niemal tak samo szybko. GA jest tu nadmiarowy — i o to chodzi w przykładzie. |
| **CMA-ES / ewolucja różnicowa** | Ciągłe wektory (ceny, budżety), nie permutacje | Inna reprezentacja. Na trasie sklepów nie pasują bez dekodera. |
| **2-opt / 3-opt / Lin–Kernighan** na TSP | Trasa z obowiązkowymi punktami | Przy 7 stopach wynik ≈ GA i ≈ brute. Przy 20+ stopach lokalne przeszukiwanie zwykle bije naiwnego GA i jest szybsze. |
| **Dokładny solver (MILP, OR-Tools)** | 7–12 punktów, twarde okna czasu, pojemność auta | Dostajesz optimum albo dowód, że go nie ma. Przy 11 sklepach z pomijaniem (handlowiec) przestrzeń eksploduje — wtedy heurystyka. |
| **Programowanie dynamiczne / knapsack** | Dzień handlowca bez geografii | Weźmiesz najdroższe kontrakty w budżecie minut i **pominiesz korytarz** (plaża). Geografii nie ma w plecaku. |
| **NSGA-II** | Dwa cele naraz: marża i litry, albo zł i godziny | Front Pareta zamiast jednej liczby. U nas fitness jest skalarny. |
| **GA / MILP na kalendarzu promo** | Szukasz tygodnia × linia × mechanika, nie 6 presetów | Presety pokazują *intuicję*. Optymalizator znajdzie dziwny mix (np. Flirt co drugi tydzień, Euforia tylko w ciszy), który może wygrać marżą i zepsuć drabinę cen — trzeba dodać twarde ograniczenia (max głębokość Euforii, zakaz Retro+Pycha). |

**Skrót:** OneMax uczy mechaniki GA. 7 wizyt pokazuje, że zachłanność kłamie, a optimum da się sprawdzić. Dzień handlowca pokazuje, że fitness musi być celem biznesowym (zł, nie km). Kalendarz lodów pokazuje *model decyzji* — rotacja, drabina zł/L, limit — zanim w ogóle puścisz ewolucję.
