# Laboratorium promocji i ewolucji

Od opisu sytuacji, przez parametry wyliczone z Waszych danych, po kalendarz promo znaleziony algorytmem
ewolucyjnym — plus trzy przykłady dydaktyczne, na których widać, jak taki algorytm działa.

**Wykonawca dokumentacji:** Marcin Szczęsny

## Adresy

- Aplikacja: https://evo-promo-lab.vercel.app
- Kod: https://github.com/heyagotoai/evo-promo-lab

HashRouter: `/#/doradca` · `/#/plan` · `/#/linie` · `/#/handlowiec` · `/#/trasa` · `/#/onemax`

## Lokalnie

```bash
npm install
npm run dev        # aplikacja
npm test           # 104 testy modelu, optymalizatora, doradcy, odporności i eksportu
npm run typecheck  # tsc --noEmit
```

Każdy push do `main` i każdy pull request przechodzi ten sam zestaw w GitHub Actions
(`.github/workflows/ci.yml`): `npm ci` → typy → testy → build produkcyjny.

## Ścieżka robocza

### 1. Doradca parametrów (`/#/doradca`)

Opisujesz sytuację liczbami, które masz w raportach. Doradca **nie zgaduje** — każdą gałkę modelu wylicza,
odwracając ten sam wzór, którego używa symulacja.

| Podajesz | Doradca wylicza |
|---|---|
| Sztuki w typowym tygodniu i w 1. tygodniu akcji | Elastyczność linii |
| Sztuki w 3. tygodniu tej samej akcji | Zmęczenie fali |
| Sztuki w 1. tygodniu po akcji | Dołek spiżarni |
| Sztuki sąsiadki w tygodniu akcji | Kanibalizację |
| Cennik i kalkulację kosztu | Progi opłacalności każdej mechaniki |

Sell-out liczy sztuki **razem z gratisami**, model liczy lift na sztukach płatnych — doradca dzieli przez
mnożnik mechaniki, więc 1+1 nie zawyża elastyczności dwukrotnie.

Czego nie da się policzyć, zostaje wartością **DOMYŚLNĄ**, jawnie oznaczoną w tabeli odczytów, z pytaniem
do zadania i miejscem, gdzie tej liczby szukać. Licznik pewności pokazuje, ile odczytów stoi na Waszych
danych, a nie na modelu.

Dane sprzeczne z modelem są **zgłaszane, a nie dopasowywane**: akcja, która nie podniosła sprzedaży;
elastyczność poza skalą; kanibalizacja powyżej 100%; trzeci tydzień mocniejszy od pierwszego; koszt
wytworzenia powyżej ceny; kotwica, która nie jest najdroższa za litr.

### 2. Optymalizator kalendarza (`/#/plan`)

**Algorytm ewolucyjny** na kalendarzu promo. Genom = mechanika każdej z 4 linii w każdym z 12 tygodni
(48 genów, 9 alleli). Fitness = marża, litry albo obrót — z twardymi progami na pozostałych.

- porządek leksykograficzny: plan dopuszczalny > mniejsze złamanie progu > wyższy cel (bez wag i strojenia)
- krzyżowanie po tygodniach + makro-mutacje: przesunięcie całej fali linii, zamiana dwóch tygodni
- elityzm 2, selekcja turniejowa, populacja 60
- populacja startowa zawiera 6 obecnych presetów — wynik nigdy nie jest gorszy od dzisiejszego planu
- ziarno losowe w interfejsie: ten sam numer odtwarza dokładnie ten sam przebieg na prezentacji

**Twarde reguły** (funkcja naprawcza sprowadza każdy plan do legalnego — naprawa tylko wyłącza i spłyca,
nigdy nie dokłada, więc z optymalizatora nie wychodzi plan łamiący którąkolwiek z nich):

| Reguła | Po co |
|---|---|
| Sufit głębokości na linię | Kotwica pełnej ceny nie schodzi za nisko |
| Zakaz gratisów na kotwicy | 2+2 na premium wywraca drabinę |
| Ochrona drabiny zł/L | Efektywna cena litra premium nie spada pod regularną tańszej linii |
| Zakazane pary linii | Retro i Pycha to ten sam kupiec |
| Maks. fala i minimalna cisza po niej | Marka nie zostaje „wiecznie w gazetce" |
| Budżet tygodni gazetki na linię | Tyle, ile realnie wykupione |
| Maks. linii naraz w tygodniu | Ile sieć wystawi |
| Min. tygodni bez gazetki | Cena referencyjna ma się gdzie odbudować |
| Limit łańcucha w każdym tygodniu (opcjonalnie) | Nadwyżka i tak nie dojedzie |

Audyt planu rozdziela **reguły** (nigdy nie złamane) od **skutków** (przycięcia limitem, tygodnie na
minusie) — skutek to nie zasada, tylko rzecz do zobaczenia przed wysłaniem gazetki.

**Eksport.** Znaleziony plan wychodzi z przeglądarki dwoma drogami: „Kopiuj plan do arkusza" (TSV,
wkleja się wprost do Excela i Arkuszy) oraz „Pobierz CSV" (średnik, przecinek dziesiętny i BOM, żeby
polski Excel nie zjadł ogonków). Raport nie jest samą tabelką tygodni — niesie parametry **razem z ich
źródłem**, cennik, efektywne zł/L, podsumowanie wobec dzisiejszego planu, listę reguł z dowodem i wynik
testu odporności. Tyle, żeby wkleić do decka bez dopisywania przypisów.

Optymalizator mówi wprost, gdy:

- **najlepszym planem jest brak promocji** — przy Waszych cenach i elastyczności każda mechanika oddaje
  więcej marży, niż odzyskuje wolumenem;
- **brief jest wewnętrznie sprzeczny** — nie da się naraz utrzymać wolumenu i nie przebić limitu; wtedy
  pokazuje, czego brakuje i o ile, bo to wynik do eskalacji, a nie do obejścia;
- **limit łańcucha jest wyczerpany samą sprzedażą regularną** — w upale sufit potrafi zniknąć zanim
  ktokolwiek wydrukuje gazetkę.

### Odporność na niepewność parametrów

Plan jest optymalny dla **jednego** zestawu parametrów, a Doradca sam przyznaje, które z nich są
DOMYŚLNE. Test odporności zadaje inne pytanie niż optymalizator: czy przewaga nad dzisiejszym planem
przeżywa niepewność danych, na których stanęła.

Znaleziony plan i punkt odniesienia idą przez 200 zaburzonych scenariuszy rynku. Zasada, która czyni to
uczciwym: **parametry zmierzone zaburzamy wąsko (±15%), zadeklarowane ±10%, a domyślne szeroko (±40%)** —
niepewność danych wchodzi wtedy do wyniku, zamiast wisieć w przypisie. To nie jest ponowna optymalizacja:
plan się nie zmienia, zmienia się rynek.

Wynik to cztery liczby i jedna tabela:

- w ilu scenariuszach plan bije dzisiejszy,
- w ilu spełnia twarde progi briefu — **obok ta sama wartość dla dzisiejszego planu**, bo w słabszym
  rynku progu bezwzględnego potrafi nie dowieźć nikt i bez tego porównania wskaźnik wprowadza w błąd,
- mediana i 5. percentyl przewagi (czyli jak wygląda zły, ale nie skrajny rok),
- **„co zmierzyć najpierw"** — ranking parametrów po tym, jak mocno ruszają przewagą na własnym paśmie.
  Góra tej tabeli to pomiar, którego brak kosztuje najwięcej; łączy się wprost z listą braków w Doradcy.

### 3. Presety rotacji (`/#/linie`)

Sześć gotowych rotacji na tym samym modelu (chroń premium, 1 po 1, Flirt+Euforia, Retro+Pycha, tylko Flirt,
wszystkie naraz). Punkt odniesienia dla optymalizatora i intuicja: kanibalizacja, drabina zł/L, limit
łańcucha, zmęczenie fali, dołek spiżarni.

Strona czyta scenariusz zapisany w Doradcy — jeden przycisk podstawia ceny, koszty i parametry rynku,
żeby presety i optymalizator pokazywały te same liczby o tej samej firmie. Wartość zmierzona, która nie
trafia w gotowe pasmo modelowe, dokłada się jako osobna pozycja listy z etykietą „z Doradcy" — zamiast
być po cichu zaokrąglona do najbliższego presetu.

Ceny regularne i koszt wytworzenia są edytowalne. Kartony: Euforia 6, Retro 6, Pycha 4, Flirt 8 szt.

## Próg opłacalności

Najważniejsza liczba w całym narzędziu, bo liczona **wprost z ceny i kosztu wytworzenia — bez żadnego
założenia o rynku**. Mówi, jaka musiałaby być elastyczność, żeby akcja wyszła dokładnie na zero wobec
tygodnia bez gazetki:

```
marża na opakowaniu w akcji  =  cena po rabacie − mnożnik sztuk × koszt wytworzenia
próg elastyczności           =  (marża regularna / marża w akcji − 1) / głębokość
```

Przy wartościach modelowych **żadna mechanika nie przekracza progu** — najtaniej wypada −10% i 2+1, i to
one są najbliżej zera. To nie jest usterka, tylko wynik: przy tych marżach promocja kupuje wolumen, a nie
zarabia. Jeśli akcja i tak musi się odbyć (listing, ekspozycja, zobowiązanie wolumenowe, obrona przed
konkurencją), wpisz to jako twardy próg litrów albo obrotu — dostaniesz najtańszy sposób dowiezienia tego
wolumenu, zamiast fikcyjnie podkręconej elastyczności.

## Model symulacji

12 tygodni, 4 linie. Wszystkie liczby domyślne są **syntetyczne** — do kręcenia gałkami, nie do listingu.

- **Elastyczność** — lift = elastyczność × głębokość, z sufitem `MAX_LIFT`, żeby skrajne gałki nie
  produkowały wyników nie do obrony.
- **Zmęczenie fali** — każdy kolejny tydzień tej samej naklejki tnie lift, z podłogą 35%.
- **Dołek spiżarni** — dwa tygodnie po **realnie zakończonej** fali; gratis kopie głębiej niż procent.
- **Kanibalizacja** — symetryczny, ważony graf bliskości półkowej (Retro–Pycha najmocniej, Euforia–Flirt
  najsłabiej). Liczona **równolegle**, ze stanu sprzed kradzieży, więc wynik nie zależy od kolejności linii.
  Podłoga liczona z bazy linii kradzionej. Linia wyjęta z planu nie pochłania kradzieży w próżnię — jej
  udział przechodzi na pozostałe.
- **Limit łańcucha** — w litrach albo kartonach; nadwyżka jest przycinana i tydzień jest oznaczany.
- **Gratisy** — pełny paragon, ale COGS także na darmowych kubkach.

## Jak oceniać parametry

Ustawiaj tak, żeby opisywały rynek, nie wykres. Doradca policzy większość z tego za Ciebie, jeśli podasz
liczby z sell-outu.

| Parametr | Jak ocenić |
|---|---|
| **Sezon** | Kalendarz i pogoda, nie głębokość gazetki. Deszcz / poza sezonem ×0,7; upał ×1,4. |
| **Kanibalizacja** | Czy po promo jednej linii spada sąsiadka w tym samym sklepie. Retro ↔ Pycha zwykle wysoka; Euforia ↔ Flirt niska. |
| **Zmęczenie fali** | Tydzień 1 vs tydzień 3 tej samej naklejki. Lift pada → ostre. |
| **Dołek po promo** | Czy tydzień po akcji lodówka klienta jest pełna. Gratis (zwłaszcza 2+2) głębszy niż %. |
| **Elastyczność** | Ile sztuk dochodzi na % zniżki. Liczone ze sztuk **płatnych**, nie z sell-outu z gratisami. |
| **Limit łańcucha** | Z logistyki. Ustaw sufit, w który zwykle uderzacie — nie średni tydzień. |
| **Cena i wytworzenie** | Cennik i kalkulacja. Marża sztukowa = regularna − COGS. |
| **Długość fali** | 2–3 tygodnie to norma. 6 tygodni pokazuje, jak zmęczenie zjada marżę. |
| **Mechanika** | % gdy nie chcesz zapychać mroźni. 1+1 / 2+1 gdy litry. 2+2 = max 50% w litrach + najgłębsza spiżarnia. |

## Jak działa algorytm ewolucyjny — trzy przykłady

### OneMax (`/#/onemax`)

Klasyczny **algorytm genetyczny** na łańcuchu 20 bitów. Fitness = liczba jedynek. Turniej k=3, krzyżowanie
jednopunktowe, mutacja bit flip, elityzm 2. Cel dydaktyczny: populacja + selekcja + szum znajdują optimum,
gdy krajobraz jest gładki.

### Kolejność wizyt (`/#/trasa`)

**TSP**: 7 obowiązkowych punktów, start i koniec w biurze. Genom = permutacja. Krzyżowanie OX, mutacja
swap, elityzm. Baseline: zachłanny najbliższy sąsiad. Optimum: brute force 7! = 5040 — da się policzyć
w przeglądarce i pokazać obok wyniku EA.

### Dzień handlowca (`/#/handlowiec`)

**Orienteering**: 11 sklepów, budżet 6 godzin, nie da się wszędzie. Genom = kolejność priorytetów, dekoder
**pomija** punkt, który się nie mieści. Fitness = oczekiwane zł zamówień, nie kilometry. Pułapka: festiwal
9800 zł / 70 min vs korytarz plażowy.

Wszystkie trzy mają ziarno losowe w interfejsie — ten sam numer odtwarza ten sam przebieg.

## Plan na przyszłość: LLM do wprowadzania danych

`docs/plan-llm.md` opisuje, jak dopiąć model językowy (Gemini 3.5 Flash-Lite) do trzech rzeczy:
wypełniania Doradcy z dokumentów, prowadzenia badań nad skutecznością briefów i podsumowywania
wyników. Kod jeszcze nie istnieje — dokument ustala granicę, poza którą model nie wchodzi:

> LLM obsługuje język i sytuację. Kod obsługuje arytmetykę i przeszukiwanie.

Model nie produkuje żadnej liczby trafiającej do symulacji, nie generuje kalendarza promo
i nie podaje w podsumowaniu liczby, której nie zwróciło narzędzie. Warstwa jest w pełni
opcjonalna — narzędzie ma dalej działać w przeglądarce bez sieci.

## Czego tu nie ma — i co by się zmieniło

| Zamiast | Kiedy warto | Co innego zobaczysz |
|---|---|---|
| **Wspinaczka / SA** na OneMax | Krajobraz bez oszustw | Hill-climb znajdzie 20/20 niemal tak samo szybko. GA jest tu nadmiarowy — i o to chodzi. |
| **CMA-ES / ewolucja różnicowa** | Ciągłe wektory (ceny, budżety), nie permutacje | Inna reprezentacja. Pozwoliłaby optymalizować samą głębokość rabatu, a nie wybór z 9 mechanik. |
| **2-opt / Lin–Kernighan** na TSP | Trasa z obowiązkowymi punktami | Przy 7 stopach ≈ GA i ≈ brute. Przy 20+ lokalne przeszukiwanie zwykle bije naiwnego GA. |
| **Held–Karp** na dniu handlowca | 11 punktów z pomijaniem | 2¹¹ × 11 stanów — da się policzyć dokładnie i pokazać optimum obok wyniku EA, tak jak na trasie. |
| **MILP / OR-Tools** na kalendarzu promo | Reguły dają się zapisać liniowo | Optimum albo dowód, że go nie ma. Kanibalizacja i zmęczenie są nieliniowe — trzeba by je linearyzować. |
| **NSGA-II** | Dwa cele naraz: marża i litry | Front Pareta zamiast jednej liczby. Dziś jest cel skalarny z twardymi progami — prostszy do obrony przed kupcem. |

**Skrót:** OneMax uczy mechaniki GA. Siedem wizyt pokazuje, że zachłanność kłamie, a optimum da się
sprawdzić. Dzień handlowca pokazuje, że fitness musi być celem biznesowym. Doradca pilnuje, żeby parametry
pochodziły z danych, a nie z przeczucia. Optymalizator szuka kalendarza, którego nie da się wyklikać —
i mówi wprost, kiedy najlepszym planem jest brak promocji.
