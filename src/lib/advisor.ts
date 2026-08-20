import {
  CARTON,
  LINES,
  MECH_BY_ID,
  affinity,
  breakEvenElasticity,
  packMargin,
  reachable,
  requiredLift,
  zlL,
  type CapMode,
  type Line,
  type LineId,
  type MechId,
  type SimParams,
} from "./lines";
import { DEFAULT_GOAL, DEFAULT_GUARDS, type Goal, type Guards } from "./optimize";

/**
 * Doradca nie zgaduje. Każdą gałkę modelu wylicza z liczby, którą podał użytkownik,
 * odwracając dokładnie ten sam wzór, którego używa symulacja. Czego nie da się
 * wyliczyć, zostaje wartością domyślną — jawnie oznaczoną i z opisem pomiaru,
 * który trzeba wykonać, żeby ją zastąpić.
 */

export type Evidence = "measured" | "declared" | "default";

export type Reading = {
  key: string;
  label: string;
  value: number;
  display: string;
  evidence: Evidence;
  source: string;
  n?: number;
};

export type Missing = {
  key: string;
  label: string;
  question: string;
  where: string;
};

export type Flag = { level: "warn" | "bad"; title: string; text: string };

/** Jedna obserwacja z przeszłej akcji — tyle, ile widać w raporcie sell-out sieci. */
export type Observation = {
  line: LineId;
  mech: MechId;
  /** Sztuki w typowym tygodniu bez gazetki, ta sama sieć, ta sama pora roku. */
  baseWeek: number | null;
  /** Sztuki, które zeszły z półki w 1. tygodniu akcji — razem z gratisowymi. */
  promoWeek1: number | null;
  /** Sztuki w 3. tygodniu tej samej akcji, razem z gratisowymi (jeśli trwała tak długo). */
  promoWeek3: number | null;
  /** Sztuki w 1. tygodniu po akcji. */
  afterWeek: number | null;
  /** Linia sąsiednia na półce, obserwowana w tym samym tygodniu akcji. */
  neighbour: LineId | null;
  neighbourBase: number | null;
  neighbourPromoWeek: number | null;
};

export type Situation = {
  observations: Observation[];
  season: "rain" | "normal" | "heat" | null;
  capMode: CapMode;
  cap: number | null;
  price: Record<LineId, number | null>;
  cogs: Record<LineId, number | null>;
  inPlan: Record<LineId, boolean>;
  anchor: Record<LineId, boolean>;
  sameBuyer: [LineId, LineId][];
  bookedWeeks: Record<LineId, number | null>;
  maxLinesPerWeek: number | null;
  minSilentWeeks: number | null;
  maxBurst: number | null;
  /** Zobowiązanie wolumenowe na 12 tygodni (litry). Null = brak. */
  volumeCommitment: number | null;
  allowGratis: Record<LineId, boolean>;
  maxDepth: Record<LineId, number | null>;
};

export type BreakEvenRow = {
  line: LineId;
  mech: MechId;
  have: number;
  need: number;
  reachable: boolean;
  packMargin: number;
  verdict: "ok" | "cienko" | "pod progiem" | "nigdy";
};

export type Advice = {
  params: SimParams;
  lines: Line[];
  guards: Guards;
  goal: Goal;
  readings: Reading[];
  missing: Missing[];
  flags: Flag[];
  breakEven: BreakEvenRow[];
  confidence: { measured: number; total: number; level: "wysoka" | "średnia" | "niska" };
  verdict: string[];
};

export const SEASON_VALUE: Record<"rain" | "normal" | "heat", number> = {
  rain: 0.7,
  normal: 1,
  heat: 1.4,
};

export function emptyObservation(line: LineId): Observation {
  return {
    line,
    mech: "none",
    baseWeek: null,
    promoWeek1: null,
    promoWeek3: null,
    afterWeek: null,
    neighbour: null,
    neighbourBase: null,
    neighbourPromoWeek: null,
  };
}

export function emptySituation(): Situation {
  return {
    observations: [emptyObservation("flirt")],
    season: null,
    capMode: "liters",
    cap: null,
    price: { euforia: null, retro: null, pycha: null, flirt: null },
    cogs: { euforia: null, retro: null, pycha: null, flirt: null },
    inPlan: { euforia: true, retro: true, pycha: true, flirt: true },
    anchor: { euforia: true, retro: false, pycha: false, flirt: false },
    sameBuyer: [],
    bookedWeeks: { euforia: null, retro: null, pycha: null, flirt: null },
    maxLinesPerWeek: null,
    minSilentWeeks: null,
    maxBurst: null,
    volumeCommitment: null,
    allowGratis: { euforia: false, retro: true, pycha: true, flirt: true },
    maxDepth: { euforia: null, retro: null, pycha: null, flirt: null },
  };
}

const pos = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

/** Współczynnik, przez który model mnoży elastyczność w danej mechanice. */
function liftFactor(mech: MechId): number {
  const m = MECH_BY_ID[mech];
  return m.depth * (m.minPaid > 1 ? 0.88 : 1);
}

/* ------------------------------------------------------- odczyty z obserwacji */

type Derived = {
  elasticity: Partial<Record<LineId, { value: number; raw: number; clamped: boolean }>>;
  fatigue: { value: number; n: number } | null;
  pantry: { value: number; n: number } | null;
  cannibal: { value: number; n: number } | null;
  flags: Flag[];
};

export function derive(s: Situation): Derived {
  const flags: Flag[] = [];
  const elasticity: Derived["elasticity"] = {};
  const fatigues: number[] = [];
  const pantries: number[] = [];
  const cannibals: number[] = [];
  const nameOf = (id: LineId) => LINES.find((l) => l.id === id)?.name ?? id;
  const present = (Object.keys(s.inPlan) as LineId[]).filter((id) => s.inPlan[id]);

  for (const o of s.observations) {
    const k = liftFactor(o.mech);
    if (k <= 0 || !pos(o.baseWeek)) continue;

    // Sell-out liczy wszystkie sztuki, które zeszły z półki; model liczy lift
    // na sztukach płatnych. Przy 1+1 i 2+2 to dwa razy różne liczby.
    const unit = MECH_BY_ID[o.mech].unitMult;

    let lift1: number | null = null;
    if (pos(o.promoWeek1)) {
      lift1 = o.promoWeek1 / unit / o.baseWeek - 1;
      const raw = lift1 / k;
      const value = clamp(raw, 0, 8);
      elasticity[o.line] = { value, raw, clamped: Math.abs(raw - value) > 1e-9 };
      if (lift1 <= 0) {
        flags.push({
          level: "bad",
          title: `${nameOf(o.line)}: akcja nie podniosła sprzedaży`,
          text: `Tydzień akcji to ${(o.promoWeek1 / unit).toFixed(0)} szt. płatnych wobec ${o.baseWeek} szt. w typowym tygodniu. Zanim policzysz elastyczność, sprawdź braki towaru, datę wejścia gazetki i czy sieć faktycznie wystawiła ekspozycję.`,
        });
      } else if (raw > 8) {
        flags.push({
          level: "warn",
          title: `${nameOf(o.line)}: elastyczność ${raw.toFixed(1)} jest poza skalą`,
          text: `Taki skok rzadko pochodzi od samej ceny. Sprawdź, czy w tym tygodniu nie było drugiej ekspozycji, końcówki sezonu albo doładowania magazynu sieci. Do modelu wchodzi 8,0 — potraktuj to jako sufit, nie pomiar.`,
        });
      }
    }

    if (lift1 && lift1 > 0 && pos(o.promoWeek3)) {
      const lift3 = o.promoWeek3 / unit / o.baseWeek - 1;
      const f = (1 - lift3 / lift1) / 2;
      const v = clamp(f, 0, 0.5);
      fatigues.push(v);
      if (f < -0.02) {
        flags.push({
          level: "warn",
          title: `${nameOf(o.line)}: trzeci tydzień sprzedał więcej niż pierwszy`,
          text: "To nie jest zmęczenie fali — wygląda na narastający sezon albo opóźnioną ekspozycję. Zmęczenie zostaje na 0; zmierz je na akcji w stabilnej pogodzie.",
        });
      }
    }

    if (pos(o.afterWeek)) {
      const gratis = MECH_BY_ID[o.mech].kind === "gratis";
      const drop = 1 - o.afterWeek / o.baseWeek;
      const v = clamp(drop / (gratis ? 1.35 : 1), 0, 0.5);
      pantries.push(v);
      if (drop < -0.05) {
        flags.push({
          level: "warn",
          title: `${nameOf(o.line)}: po akcji sprzedaż wzrosła`,
          text: "Dołka spiżarni nie widać. Albo akcja zbudowała próbę, albo tydzień po był cieplejszy. Dołek zostaje na 0 — to założenie optymistyczne, oznacz je w prezentacji.",
        });
      }
    }

    if (
      lift1 &&
      lift1 > 0 &&
      o.neighbour &&
      o.neighbour !== o.line &&
      pos(o.neighbourBase) &&
      pos(o.neighbourPromoWeek)
    ) {
      const extra = o.baseWeek * lift1;
      const aff = affinity(o.line, o.neighbour);
      const sum = present.filter((x) => x !== o.line).reduce((acc, x) => acc + affinity(o.line, x), 0);
      const share = sum > 0 ? aff / sum : 0;
      if (share > 0 && extra > 0) {
        const loss = o.neighbourBase - o.neighbourPromoWeek;
        const raw = loss / (extra * share);
        const v = clamp(raw, 0, 1);
        cannibals.push(v);
        if (raw > 1.05) {
          flags.push({
            level: "warn",
            title: `${nameOf(o.neighbour)} straciła więcej, niż ${nameOf(o.line)} zyskała`,
            text: "Kanibalizacja powyżej 100% oznacza, że działał jeszcze inny czynnik — brak towaru, zmiana miejsca na półce, akcja konkurencji. Do modelu wchodzi 1,00.",
          });
        }
      } else if (aff <= 0) {
        flags.push({
          level: "warn",
          title: `${nameOf(o.line)} i ${nameOf(o.neighbour)} nie są sąsiadkami w modelu`,
          text: "Model nie przewiduje między nimi przepływu, więc z tej pary nie da się policzyć kanibalizacji. Zmierz ją na parze stojącej obok siebie na półce.",
        });
      }
    }
  }

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    elasticity,
    fatigue: fatigues.length ? { value: mean(fatigues), n: fatigues.length } : null,
    pantry: pantries.length ? { value: mean(pantries), n: pantries.length } : null,
    cannibal: cannibals.length ? { value: mean(cannibals), n: cannibals.length } : null,
    flags,
  };
}

/* ------------------------------------------------------- pełna porada */

const DEFAULTS = { season: 1, cannibal: 0.4, fatigue: 0.14, pantry: 0.12, cap: 8000, cartonCap: 400 };

export function advise(s: Situation): Advice {
  const d = derive(s);
  const readings: Reading[] = [];
  const missing: Missing[] = [];
  const flags: Flag[] = [...d.flags];
  const nameOf = (id: LineId) => LINES.find((l) => l.id === id)?.name ?? id;

  const put = (r: Reading) => readings.push(r);
  const ask = (m: Missing) => missing.push(m);

  // --- ceny i koszt wytworzenia
  const lines: Line[] = LINES.map((l) => {
    const price = pos(s.price[l.id]) ? (s.price[l.id] as number) : l.price;
    const cogs = pos(s.cogs[l.id]) ? (s.cogs[l.id] as number) : l.cogs;
    const e = d.elasticity[l.id];
    return { ...l, price, cogs, elasticity: e ? e.value : l.elasticity };
  });

  for (const l of lines) {
    const hasP = pos(s.price[l.id]);
    const hasC = pos(s.cogs[l.id]);
    put({
      key: `price-${l.id}`,
      label: `${l.name} — cena regularna`,
      value: l.price,
      display: `${l.price.toFixed(2)} zł (${zlL(l).toFixed(2)} zł/L)`,
      evidence: hasP ? "measured" : "default",
      source: hasP ? "z cennika" : "wartość modelowa — wstaw swój cennik",
    });
    if (!hasP) {
      ask({
        key: `price-${l.id}`,
        label: `${l.name} — cena regularna`,
        question: "Ile kosztuje opakowanie w cenie półkowej, bez gazetki?",
        where: "cennik / karta produktu",
      });
    }
    put({
      key: `cogs-${l.id}`,
      label: `${l.name} — koszt wytworzenia`,
      value: l.cogs,
      display: `${l.cogs.toFixed(2)} zł (marża ${(l.price - l.cogs).toFixed(2)} zł/szt.)`,
      evidence: hasC ? "measured" : "default",
      source: hasC ? "z kalkulacji" : "wartość modelowa — wstaw swoją kalkulację",
    });
    if (!hasC) {
      ask({
        key: `cogs-${l.id}`,
        label: `${l.name} — koszt wytworzenia`,
        question: "Ile kosztuje wyprodukowanie i dostarczenie jednego opakowania?",
        where: "kalkulacja kosztu / kontroling",
      });
    }
  }

  // --- elastyczność
  for (const l of lines) {
    const e = d.elasticity[l.id];
    if (e) {
      put({
        key: `elast-${l.id}`,
        label: `${l.name} — elastyczność`,
        value: e.value,
        display: e.clamped ? `${e.value.toFixed(2)} (przycięte z ${e.raw.toFixed(2)})` : e.value.toFixed(2),
        evidence: "measured",
        source: "z Twojej akcji: przyrost sztuk podzielony przez głębokość promocji",
      });
    } else {
      put({
        key: `elast-${l.id}`,
        label: `${l.name} — elastyczność`,
        value: l.elasticity,
        display: l.elasticity.toFixed(2),
        evidence: "default",
        source: "wartość modelowa — nie zmierzona na Waszych danych",
      });
      ask({
        key: `elast-${l.id}`,
        label: `${l.name} — elastyczność`,
        question: `Ile sztuk ${l.name} zeszło w tygodniu ostatniej akcji, a ile w typowym tygodniu bez gazetki?`,
        where: "raport sell-out sieci, dwa tygodnie obok siebie",
      });
    }
  }

  // --- sezon
  const season = s.season ? SEASON_VALUE[s.season] : DEFAULTS.season;
  put({
    key: "season",
    label: "Sezon",
    value: season,
    display: `×${season.toString().replace(".", ",")}`,
    evidence: s.season ? "declared" : "default",
    source: s.season ? "z kalendarza i prognozy pogody na te 12 tygodni" : "przyjęty tydzień neutralny",
  });
  if (!s.season) {
    ask({
      key: "season",
      label: "Sezon",
      question: "Na jaką pogodę i porę roku planujesz te 12 tygodni?",
      where: "kalendarz akcji + prognoza długoterminowa",
    });
  }

  // --- zmęczenie, dołek, kanibalizacja
  const fatigue = d.fatigue?.value ?? DEFAULTS.fatigue;
  put({
    key: "fatigue",
    label: "Zmęczenie fali",
    value: fatigue,
    display: fatigue.toFixed(3),
    evidence: d.fatigue ? "measured" : "default",
    source: d.fatigue ? "z porównania 1. i 3. tygodnia akcji" : "wartość modelowa",
    n: d.fatigue?.n,
  });
  if (!d.fatigue) {
    ask({
      key: "fatigue",
      label: "Zmęczenie fali",
      question: "Ile sztuk zeszło w 3. tygodniu tej samej akcji w porównaniu z 1.?",
      where: "sell-out, akcja trwająca co najmniej 3 tygodnie",
    });
  }

  const pantry = d.pantry?.value ?? DEFAULTS.pantry;
  put({
    key: "pantry",
    label: "Dołek po promo",
    value: pantry,
    display: pantry.toFixed(3),
    evidence: d.pantry ? "measured" : "default",
    source: d.pantry ? "z tygodnia następującego po akcji" : "wartość modelowa",
    n: d.pantry?.n,
  });
  if (!d.pantry) {
    ask({
      key: "pantry",
      label: "Dołek po promo",
      question: "Ile sztuk zeszło w pierwszym tygodniu po zdjęciu gazetki?",
      where: "sell-out, tydzień bezpośrednio po akcji",
    });
  }

  const cannibal = d.cannibal?.value ?? DEFAULTS.cannibal;
  put({
    key: "cannibal",
    label: "Kanibalizacja",
    value: cannibal,
    display: cannibal.toFixed(3),
    evidence: d.cannibal ? "measured" : "default",
    source: d.cannibal ? "ze spadku sąsiadki w tygodniu akcji" : "wartość modelowa",
    n: d.cannibal?.n,
  });
  if (!d.cannibal) {
    ask({
      key: "cannibal",
      label: "Kanibalizacja",
      question: "Ile sztuk sąsiedniej linii zeszło w tygodniu akcji, a ile w typowym tygodniu?",
      where: "sell-out obu linii, ta sama sieć, ten sam tydzień",
    });
  }

  // --- limit łańcucha
  const cap = pos(s.cap) ? (s.cap as number) : s.capMode === "liters" ? DEFAULTS.cap : DEFAULTS.cartonCap;
  put({
    key: "cap",
    label: "Limit łańcucha",
    value: cap,
    display: `${cap} ${s.capMode === "liters" ? "L" : "kart."} / tydzień`,
    evidence: pos(s.cap) ? "declared" : "default",
    source: pos(s.cap) ? "z logistyki sieci" : "przyjęty sufit — sprawdź, ile mroźnia faktycznie przyjmuje",
  });
  if (!pos(s.cap)) {
    ask({
      key: "cap",
      label: "Limit łańcucha",
      question: "Ile litrów (albo kartonów) sieć jest w stanie przyjąć w szczytowym tygodniu?",
      where: "logistyka sieci / dział zamówień",
    });
  }

  const params: SimParams = {
    season,
    cannibal,
    fatigue,
    pantry,
    elastScale: 1,
    capMode: s.capMode,
    cap,
  };

  // --- reguły
  const maxDepth = { ...DEFAULT_GUARDS.maxDepth };
  for (const id of Object.keys(maxDepth) as LineId[]) {
    const v = s.maxDepth[id];
    if (typeof v === "number" && v >= 0) maxDepth[id] = v;
    else if (s.anchor[id]) maxDepth[id] = 0.2;
    else maxDepth[id] = 0.5;
    if (!s.inPlan[id]) maxDepth[id] = 0;
  }
  const maxPromoWeeks = { ...DEFAULT_GUARDS.maxPromoWeeks };
  for (const id of Object.keys(maxPromoWeeks) as LineId[]) {
    const v = s.bookedWeeks[id];
    if (typeof v === "number" && v >= 0) maxPromoWeeks[id] = v;
    else if (!s.inPlan[id]) maxPromoWeeks[id] = 0;
    else {
      ask({
        key: `booked-${id}`,
        label: `${nameOf(id)} — wykupione tygodnie gazetki`,
        question: `Ile tygodni gazetki masz w tych 12 tygodniach dla linii ${nameOf(id)}?`,
        where: "plan gazetkowy sieci / umowa roczna",
      });
    }
  }

  const guards: Guards = {
    maxDepth,
    allowGratis: { ...s.allowGratis },
    maxBurst: s.maxBurst ?? DEFAULT_GUARDS.maxBurst,
    minGap: DEFAULT_GUARDS.minGap,
    maxPromoWeeks,
    maxLinesPerWeek: s.maxLinesPerWeek ?? DEFAULT_GUARDS.maxLinesPerWeek,
    minSilentWeeks: s.minSilentWeeks ?? DEFAULT_GUARDS.minSilentWeeks,
    forbidPairs: s.sameBuyer.length ? s.sameBuyer : DEFAULT_GUARDS.forbidPairs,
    ladder: (Object.keys(s.anchor) as LineId[]).some((id) => s.anchor[id]) ? "cheapest" : "off",
    anchor: { ...s.anchor },
  };

  const goal: Goal = pos(s.volumeCommitment)
    ? { ...DEFAULT_GOAL, objective: "margin", minLiters: s.volumeCommitment as number }
    : { ...DEFAULT_GOAL, objective: "margin" };

  if (!pos(s.volumeCommitment)) {
    ask({
      key: "volume",
      label: "Zobowiązanie wolumenowe",
      question: "Ile litrów musisz sprzedać w tych 12 tygodniach, żeby dowieźć plan?",
      where: "budżet roczny / umowa z siecią",
    });
  }

  // --- progi opłacalności
  const breakEven: BreakEvenRow[] = [];
  for (const l of lines) {
    if (!s.inPlan[l.id]) continue;
    for (const mech of ["d10", "d20", "d30", "d40", "d50", "g11", "g21", "g22"] as MechId[]) {
      const m = MECH_BY_ID[mech];
      if (m.kind === "gratis" && !guards.allowGratis[l.id]) continue;
      if (m.depth > maxDepth[l.id] + 1e-9) continue;
      const need = breakEvenElasticity(l, m);
      const have = l.elasticity;
      const ok = reachable(l, m);
      const verdict: BreakEvenRow["verdict"] = !ok
        ? "nigdy"
        : have >= need * 1.15
          ? "ok"
          : have >= need
            ? "cienko"
            : "pod progiem";
      breakEven.push({ line: l.id, mech, have, need, reachable: ok, packMargin: packMargin(l, m), verdict });
    }
  }

  const usable = breakEven.filter((b) => b.verdict === "ok" || b.verdict === "cienko");
  if (breakEven.length && !usable.length) {
    flags.push({
      level: "bad",
      title: "Żadna dozwolona mechanika nie wychodzi na zero",
      text: "Przy Waszych cenach, kosztach i zmierzonej elastyczności każda promocja z tej listy oddaje więcej marży, niż odzyskuje wolumenem. Optymalizator powie to samo: najlepszy plan to brak gazetki. Zanim to odrzucisz, sprawdź trzy rzeczy — czy koszt wytworzenia zawiera koszty, których nie ma w promocji; czy sieć dopłaca do akcji; czy w grze jest coś poza marżą 12 tygodni (listing, blokada konkurencji, zobowiązanie wolumenowe). Jeśli tak, ustaw cel na litry albo obrót z twardym progiem marży.",
    });
  }

  const belowFloor = lines.filter((l) => s.inPlan[l.id] && l.cogs >= l.price);
  for (const l of belowFloor) {
    flags.push({
      level: "bad",
      title: `${l.name}: koszt wytworzenia nie jest niższy od ceny`,
      text: `${l.cogs.toFixed(2)} zł kosztu przy ${l.price.toFixed(2)} zł ceny. Każde opakowanie jest stratą także bez gazetki — popraw dane albo cenę, zanim policzysz jakikolwiek plan.`,
    });
  }

  const anchors = lines.filter((l) => s.inPlan[l.id] && s.anchor[l.id]);
  for (const a of anchors) {
    const cheaper = lines.filter((o) => s.inPlan[o.id] && o.id !== a.id && zlL(o) < zlL(a));
    if (!cheaper.length) {
      flags.push({
        level: "warn",
        title: `${a.name} jest kotwicą, ale nie jest najdroższa za litr`,
        text: "Ochrona drabiny nie ma czego bronić — w tym zestawie żadna linia nie jest tańsza za litr. Sprawdź, czy kotwica jest wskazana na właściwej linii.",
      });
    }
  }

  const measured = readings.filter((r) => r.evidence === "measured").length;
  const level = measured / readings.length >= 0.6 ? "wysoka" : measured / readings.length >= 0.3 ? "średnia" : "niska";

  const verdict: string[] = [];
  if (level === "niska") {
    verdict.push(
      "Większość gałek to wartości domyślne, nie Wasze pomiary. Traktuj wynik jako ranking wariantów — który plan jest lepszy od którego — a nie jako prognozę złotówek.",
    );
  } else if (level === "średnia") {
    verdict.push(
      "Część gałek jest zmierzona, część domyślna. Kierunek i kolejność planów są wiarygodne; bezwzględna marża ma rozrzut tak duży, jak duży jest udział wartości domyślnych.",
    );
  } else {
    verdict.push(
      "Model stoi głównie na Waszych liczbach. Bezwzględne kwoty można pokazywać, o ile pomiary pochodzą z tej samej sieci i tej samej pory roku co planowane 12 tygodni.",
    );
  }
  if (missing.length) {
    verdict.push(
      `Brakuje ${missing.length} ${missing.length === 1 ? "pomiaru" : "pomiarów"}. Każdy z nich to jedna liczba z raportu sell-out — lista jest niżej.`,
    );
  }
  verdict.push(
    "Model nie zna listingu, ekspozycji, akcji konkurencji ani dopłat sieci do gazetki. Jeśli akcja ma sens z jednego z tych powodów, wpisz go jako twardy próg (litry albo obrót), a nie jako wyższą elastyczność.",
  );

  return {
    params,
    lines,
    guards,
    goal,
    readings,
    missing,
    flags,
    breakEven,
    confidence: { measured, total: readings.length, level },
    verdict,
  };
}

export function cartonLabel(id: LineId): string {
  return `${CARTON[id]} szt.`;
}

export function requiredLiftOf(line: Line, mech: MechId): number {
  return requiredLift(line, MECH_BY_ID[mech]);
}
