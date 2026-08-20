import { describe, expect, it } from "vitest";
import {
  LINES,
  MECH_BY_ID,
  WEEKS,
  breakEvenElasticity,
  simulate,
  type LineId,
  type Line,
  type MechId,
  type Mechs,
  type SimParams,
} from "./lines";
import { advise, derive, emptyObservation, emptySituation, type Observation, type Situation } from "./advisor";

const NO: Mechs = { euforia: "none", retro: "none", pycha: "none", flirt: "none" };

/**
 * Generuje obserwacje TAK, jak wypadłyby w raporcie sell-out, gdyby rynek
 * zachowywał się dokładnie zgodnie z podanymi parametrami. Doradca musi je
 * odczytać z powrotem — to test na to, że nie zgaduje, tylko odwraca wzór.
 */
function observe(
  line: LineId,
  mech: MechId,
  neighbour: LineId,
  p: SimParams,
  lines: Line[] = LINES,
): Observation {
  const cal: LineId[][] = Array.from({ length: WEEKS }, () => [] as LineId[]);
  for (let w = 0; w < 3; w++) cal[w] = [line];
  const mechs: Mechs = { ...NO, [line]: mech } as Mechs;
  const promo = simulate(cal, mechs, p, lines);
  const quiet = simulate(
    Array.from({ length: WEEKS }, () => [] as LineId[]),
    NO,
    p,
    lines,
  );
  return {
    line,
    mech,
    baseWeek: quiet[0].packs[line],
    promoWeek1: promo[0].packs[line],
    promoWeek3: promo[2].packs[line],
    afterWeek: promo[3].packs[line],
    neighbour,
    neighbourBase: quiet[0].packs[neighbour],
    neighbourPromoWeek: promo[0].packs[neighbour],
  };
}

function situationWith(obs: Observation[]): Situation {
  const s = emptySituation();
  s.observations = obs;
  s.season = "normal";
  return s;
}

describe("odwracanie modelu", () => {
  const cases: { mech: MechId; p: SimParams }[] = [
    { mech: "d20", p: { season: 1, cannibal: 0.4, fatigue: 0.14, pantry: 0.12, elastScale: 1, capMode: "liters", cap: 1e9 } },
    { mech: "d30", p: { season: 1, cannibal: 0.65, fatigue: 0.25, pantry: 0.22, elastScale: 1, capMode: "liters", cap: 1e9 } },
    { mech: "g11", p: { season: 1, cannibal: 0.2, fatigue: 0.06, pantry: 0.05, elastScale: 1, capMode: "liters", cap: 1e9 } },
    { mech: "g21", p: { season: 1, cannibal: 0.5, fatigue: 0.1, pantry: 0.15, elastScale: 1, capMode: "liters", cap: 1e9 } },
  ];

  for (const { mech, p } of cases) {
    it(`odzyskuje elastyczność, zmęczenie, dołek i kanibalizację z akcji ${mech}`, () => {
      const obs = observe("retro", mech, "pycha", p);
      const d = derive(situationWith([obs]));
      const retro = LINES.find((l) => l.id === "retro")!;
      expect(d.elasticity.retro!.value).toBeCloseTo(retro.elasticity, 6);
      expect(d.fatigue!.value).toBeCloseTo(p.fatigue, 6);
      expect(d.pantry!.value).toBeCloseTo(p.pantry, 6);
      expect(d.cannibal!.value).toBeCloseTo(p.cannibal, 6);
    });
  }

  it("odzyskuje elastyczność każdej linii osobno", () => {
    const p: SimParams = { season: 1, cannibal: 0.4, fatigue: 0.14, pantry: 0.12, elastScale: 1, capMode: "liters", cap: 1e9 };
    for (const l of LINES) {
      const other = LINES.find((x) => x.id !== l.id)!.id;
      const d = derive(situationWith([observe(l.id, "d30", other, p)]));
      expect(d.elasticity[l.id]!.value).toBeCloseTo(l.elasticity, 6);
    }
  });

  it("nie myli sztuk sprzedanych ze sztukami płatnymi przy gratisach", () => {
    const p: SimParams = { season: 1, cannibal: 0, fatigue: 0.14, pantry: 0.12, elastScale: 1, capMode: "liters", cap: 1e9 };
    const obs = observe("flirt", "g11", "pycha", p);
    const naive = obs.promoWeek1! / obs.baseWeek! - 1; // gdyby ktoś zapomniał o gratisach
    const d = derive(situationWith([obs]));
    const flirt = LINES.find((l) => l.id === "flirt")!;
    expect(d.elasticity.flirt!.value).toBeCloseTo(flirt.elasticity, 6);
    expect(naive / MECH_BY_ID.g11.depth).toBeGreaterThan(flirt.elasticity * 1.5);
  });

  it("odzyskuje podniesioną elastyczność, gdy rynek reaguje mocniej", () => {
    const p: SimParams = { season: 1, cannibal: 0.4, fatigue: 0.14, pantry: 0.12, elastScale: 1, capMode: "liters", cap: 1e9 };
    const hot = LINES.map((l) => (l.id === "flirt" ? { ...l, elasticity: 3.6 } : l));
    const d = derive(situationWith([observe("flirt", "d20", "pycha", p, hot)]));
    expect(d.elasticity.flirt!.value).toBeCloseTo(3.6, 6);
  });

  it("działa też przy sezonie innym niż neutralny", () => {
    const p: SimParams = { season: 1.4, cannibal: 0.4, fatigue: 0.14, pantry: 0.12, elastScale: 1, capMode: "liters", cap: 1e9 };
    const d = derive(situationWith([observe("pycha", "d30", "retro", p)]));
    const pycha = LINES.find((l) => l.id === "pycha")!;
    expect(d.elasticity.pycha!.value).toBeCloseTo(pycha.elasticity, 6);
    expect(d.cannibal!.value).toBeCloseTo(0.4, 6);
  });

  it("uśrednia kilka obserwacji i mówi, ile ich było", () => {
    const p: SimParams = { season: 1, cannibal: 0.4, fatigue: 0.14, pantry: 0.12, elastScale: 1, capMode: "liters", cap: 1e9 };
    const d = derive(situationWith([observe("retro", "d20", "pycha", p), observe("flirt", "d30", "pycha", p)]));
    expect(d.fatigue!.n).toBe(2);
    expect(d.pantry!.n).toBe(2);
    expect(d.fatigue!.value).toBeCloseTo(0.14, 6);
  });
});

describe("uczciwość odczytu", () => {
  it("bez danych nie wymyśla pomiarów — wszystko jest oznaczone jako domyślne", () => {
    const a = advise(emptySituation());
    expect(a.readings.some((r) => r.evidence === "measured")).toBe(false);
    expect(a.confidence.measured).toBe(0);
    expect(a.confidence.level).toBe("niska");
    expect(a.missing.length).toBeGreaterThan(0);
  });

  it("każdy brakujący pomiar ma pytanie i źródło", () => {
    const a = advise(emptySituation());
    for (const m of a.missing) {
      expect(m.question.length).toBeGreaterThan(10);
      expect(m.where.length).toBeGreaterThan(3);
    }
  });

  it("podana liczba podnosi pewność i znika z listy braków", () => {
    const s = emptySituation();
    const before = advise(s);
    s.price.flirt = 15;
    s.cogs.flirt = 7;
    const after = advise(s);
    expect(after.confidence.measured).toBe(before.confidence.measured + 2);
    expect(after.missing.some((m) => m.key === "price-flirt")).toBe(false);
    expect(before.missing.some((m) => m.key === "price-flirt")).toBe(true);
  });

  it("zgłasza akcję, która nie podniosła sprzedaży, zamiast liczyć ujemną elastyczność", () => {
    const s = emptySituation();
    s.observations = [{ ...emptyObservation("retro"), mech: "d20", baseWeek: 1000, promoWeek1: 900 }];
    const a = advise(s);
    expect(a.flags.some((f) => f.level === "bad")).toBe(true);
    expect(a.readings.find((r) => r.key === "elast-retro")!.value).toBe(0);
  });

  it("przycina elastyczność poza skalą i mówi o tym wprost", () => {
    const s = emptySituation();
    s.observations = [{ ...emptyObservation("retro"), mech: "d10", baseWeek: 1000, promoWeek1: 3000 }];
    const a = advise(s);
    const r = a.readings.find((x) => x.key === "elast-retro")!;
    expect(r.value).toBe(8);
    expect(r.display).toContain("przycięte");
    expect(a.flags.some((f) => f.title.includes("poza skalą"))).toBe(true);
  });

  it("zgłasza kanibalizację powyżej 100% jako sygnał innego czynnika", () => {
    const s = emptySituation();
    s.observations = [
      {
        ...emptyObservation("pycha"),
        mech: "d20",
        baseWeek: 1000,
        promoWeek1: 1200,
        neighbour: "retro",
        neighbourBase: 1000,
        neighbourPromoWeek: 300,
      },
    ];
    const a = advise(s);
    expect(a.flags.some((f) => f.title.includes("straciła więcej"))).toBe(true);
    expect(a.readings.find((r) => r.key === "cannibal")!.value).toBe(1);
  });

  it("nie liczy kanibalizacji z pary, której model nie zna", () => {
    const s = emptySituation();
    s.observations = [
      {
        ...emptyObservation("retro"),
        mech: "d20",
        baseWeek: 1000,
        promoWeek1: 1400,
        neighbour: "retro",
        neighbourBase: 900,
        neighbourPromoWeek: 700,
      },
    ];
    const a = advise(s);
    expect(a.readings.find((r) => r.key === "cannibal")!.evidence).toBe("default");
  });
});

describe("progi opłacalności i reguły", () => {
  it("liczy próg dla każdej dozwolonej mechaniki i zgadza się z modelem", () => {
    const a = advise(emptySituation());
    for (const b of a.breakEven) {
      const line = a.lines.find((l) => l.id === b.line)!;
      expect(b.need).toBeCloseTo(breakEvenElasticity(line, MECH_BY_ID[b.mech]), 9);
    }
  });

  it("nie proponuje kotwicy głębiej niż −20% ani gratisów", () => {
    const a = advise(emptySituation());
    expect(a.guards.maxDepth.euforia).toBeCloseTo(0.2, 9);
    expect(a.guards.allowGratis.euforia).toBe(false);
    expect(a.breakEven.filter((b) => b.line === "euforia").every((b) => MECH_BY_ID[b.mech].kind !== "gratis")).toBe(true);
  });

  it("mówi wprost, gdy żadna mechanika nie wychodzi na zero", () => {
    const a = advise(emptySituation());
    const usable = a.breakEven.filter((b) => b.verdict === "ok" || b.verdict === "cienko");
    if (!usable.length) expect(a.flags.some((f) => f.title.includes("nie wychodzi na zero"))).toBe(true);
  });

  it("wyjęta z planu linia dostaje zerowy sufit i zero tygodni", () => {
    const s = emptySituation();
    s.inPlan.pycha = false;
    const a = advise(s);
    expect(a.guards.maxDepth.pycha).toBe(0);
    expect(a.guards.maxPromoWeeks.pycha).toBe(0);
    expect(a.breakEven.some((b) => b.line === "pycha")).toBe(false);
  });

  it("zobowiązanie wolumenowe staje się twardym progiem celu", () => {
    const s = emptySituation();
    s.volumeCommitment = 90000;
    const a = advise(s);
    expect(a.goal.objective).toBe("margin");
    expect(a.goal.minLiters).toBe(90000);
    expect(a.missing.some((m) => m.key === "volume")).toBe(false);
  });

  it("wykupione tygodnie gazetki stają się budżetem linii", () => {
    const s = emptySituation();
    s.bookedWeeks.flirt = 4;
    const a = advise(s);
    expect(a.guards.maxPromoWeeks.flirt).toBe(4);
    expect(a.missing.some((m) => m.key === "booked-flirt")).toBe(false);
  });

  it("zgłasza koszt wytworzenia powyżej ceny zamiast liczyć plan", () => {
    const s = emptySituation();
    s.price.retro = 10;
    s.cogs.retro = 12;
    const a = advise(s);
    expect(a.flags.some((f) => f.level === "bad" && f.title.includes("koszt wytworzenia"))).toBe(true);
  });

  it("wskazuje, że kotwica nie jest najdroższa za litr", () => {
    const s = emptySituation();
    s.anchor = { euforia: false, retro: false, pycha: false, flirt: true };
    const a = advise(s);
    expect(a.flags.some((f) => f.title.includes("nie jest najdroższa za litr"))).toBe(true);
  });

  it("werdykt zawsze przypomina, czego model nie zna", () => {
    const a = advise(emptySituation());
    expect(a.verdict.join(" ")).toContain("listingu");
  });
});
