import { describe, expect, it } from "vitest";
import { LINES, buildCalendar, type Line, type Mechs, type SimParams } from "./lines";
import {
  DEFAULT_GOAL,
  DEFAULT_GUARDS,
  buildAllowed,
  initOptimizer,
  planFromCalendar,
  runOptimizer,
  type OptCtx,
} from "./optimize";
import { advise, emptySituation } from "./advisor";
import {
  BAND_BY_EVIDENCE,
  applyFactors,
  drawFactors,
  knobsFor,
  stressTest,
  stressVerdict,
  type Knob,
} from "./robust";
import { makeRng } from "./rng";

const P: SimParams = {
  season: 1,
  cannibal: 0.4,
  fatigue: 0.14,
  pantry: 0.12,
  elastScale: 1,
  capMode: "liters",
  cap: 8000,
};
const MIX: Mechs = { euforia: "d10", retro: "d20", pycha: "g21", flirt: "g11" };

const presetPlan = (id: string) => planFromCalendar(buildCalendar(id, 3), MIX, LINES);

function foundPlan() {
  const ctx: OptCtx = {
    lines: LINES,
    params: P,
    guards: DEFAULT_GUARDS,
    goal: DEFAULT_GOAL,
    allowed: buildAllowed(LINES, DEFAULT_GUARDS),
    popSize: 40,
    mutation: 0.08,
  };
  return runOptimizer(initOptimizer(ctx, 5, [presetPlan("sequential")]), ctx, 40).best;
}

const base = (knobs: Knob[], n = 60, seed = 1, plan = foundPlan(), reference = presetPlan("sequential")) =>
  stressTest({ plan, reference, lines: LINES, params: P, goal: DEFAULT_GOAL, knobs, n, seed });

describe("pasma niepewności", () => {
  it("bez scenariusza z Doradcy wszystko jest domyślne i zaburzane najszerzej", () => {
    const knobs = knobsFor(LINES, null);
    expect(knobs.length).toBe(4 + LINES.length);
    for (const k of knobs) {
      expect(k.evidence).toBe("default");
      expect(k.band).toBe(BAND_BY_EVIDENCE.default);
    }
  });

  it("parametr zmierzony dostaje węższe pasmo niż domyślny", () => {
    const s = emptySituation();
    s.season = "heat";
    s.observations = [
      {
        line: "retro",
        mech: "d20",
        baseWeek: 1300,
        promoWeek1: 1742,
        promoWeek3: 1620,
        afterWeek: 1140,
        neighbour: null,
        neighbourBase: null,
        neighbourPromoWeek: null,
      },
    ];
    const a = advise(s);
    const knobs = knobsFor(a.lines, a.readings);
    const byKey = Object.fromEntries(knobs.map((k) => [k.key, k]));
    expect(byKey["elast-retro"].evidence).toBe("measured");
    expect(byKey["elast-retro"].band).toBe(BAND_BY_EVIDENCE.measured);
    expect(byKey["season"].evidence).toBe("declared");
    expect(byKey["elast-euforia"].evidence).toBe("default");
    expect(byKey["elast-retro"].band).toBeLessThan(byKey["elast-euforia"].band);
  });
});

describe("zaburzanie parametrów", () => {
  it("mnoży wartości bazowe i trzyma je w dopuszczalnych granicach", () => {
    const out = applyFactors(P, LINES, { season: 1.2, cannibal: 5, fatigue: 0, pantry: 1, "elast-flirt": 0.5 });
    expect(out.params.season).toBeCloseTo(1.2, 9);
    expect(out.params.cannibal).toBe(1); // przycięte do 100%
    expect(out.params.fatigue).toBe(0);
    expect(out.params.pantry).toBeCloseTo(P.pantry, 9);
    expect(out.lines.find((l) => l.id === "flirt")!.elasticity).toBeCloseTo(2.35 * 0.5, 9);
  });

  it("nie rusza limitu łańcucha ani cen — to nie są parametry niepewne", () => {
    const out = applyFactors(P, LINES, { season: 1.4 });
    expect(out.params.cap).toBe(P.cap);
    expect(out.params.capMode).toBe(P.capMode);
    for (const l of out.lines) {
      const src = LINES.find((x) => x.id === l.id)!;
      expect(l.price).toBe(src.price);
      expect(l.cogs).toBe(src.cogs);
    }
  });

  it("losowanie mieści się w paśmie i jest powtarzalne dla tego samego ziarna", () => {
    const knobs = knobsFor(LINES, null);
    const a = drawFactors(makeRng(7), knobs);
    const b = drawFactors(makeRng(7), knobs);
    expect(a).toEqual(b);
    for (const k of knobs) {
      expect(a[k.key]).toBeGreaterThanOrEqual(1 - k.band - 1e-9);
      expect(a[k.key]).toBeLessThanOrEqual(1 + k.band + 1e-9);
    }
  });
});

describe("test odporności", () => {
  it("jest powtarzalny dla tego samego ziarna", () => {
    const knobs = knobsFor(LINES, null);
    const plan = foundPlan();
    const a = base(knobs, 40, 3, plan);
    const b = base(knobs, 40, 3, plan);
    expect(b.deltas).toEqual(a.deltas);
    expect(b.winRate).toBe(a.winRate);
  });

  it("przy zerowym paśmie każdy scenariusz jest scenariuszem bazowym", () => {
    const knobs = knobsFor(LINES, null).map((k) => ({ ...k, band: 0 }));
    const s = base(knobs, 20, 3);
    for (const d of s.deltas) expect(d).toBeCloseTo(s.baseDelta, 6);
    expect(s.winRate).toBe(s.baseDelta > 0 ? 1 : 0);
    expect(s.p05Delta).toBeCloseTo(s.baseDelta, 6);
  });

  it("szersze pasmo daje szerszy rozrzut", () => {
    const plan = foundPlan();
    const tight = base(knobsFor(LINES, null).map((k) => ({ ...k, band: 0.05 })), 80, 11, plan);
    const wide = base(knobsFor(LINES, null).map((k) => ({ ...k, band: 0.45 })), 80, 11, plan);
    expect(wide.bestDelta - wide.worstDelta).toBeGreaterThan(tight.bestDelta - tight.worstDelta);
    expect(wide.p05Delta).toBeLessThan(tight.p05Delta);
  });

  it("plan identyczny z odniesieniem nie wygrywa w żadnym scenariuszu", () => {
    const p = presetPlan("protect");
    const s = base(knobsFor(LINES, null), 30, 2, p, p);
    for (const d of s.deltas) expect(d).toBeCloseTo(0, 6);
    expect(s.winRate).toBe(0);
    expect(s.baseDelta).toBeCloseTo(0, 6);
  });

  it("plan z optymalizatora bije dzisiejszy w większości scenariuszy", () => {
    const s = base(knobsFor(LINES, null), 120, 21);
    expect(s.baseDelta).toBeGreaterThan(0);
    expect(s.winRate).toBeGreaterThan(0.5);
    expect(s.medianDelta).toBeGreaterThan(0);
    expect(s.worstDelta).toBeLessThanOrEqual(s.p05Delta);
    expect(s.p05Delta).toBeLessThanOrEqual(s.medianDelta);
    expect(s.medianDelta).toBeLessThanOrEqual(s.bestDelta);
  });

  it("udziały są ułamkami z przedziału 0–1", () => {
    const s = base(knobsFor(LINES, null), 50, 4);
    expect(s.winRate).toBeGreaterThanOrEqual(0);
    expect(s.winRate).toBeLessThanOrEqual(1);
    expect(s.feasibleRate).toBeGreaterThanOrEqual(0);
    expect(s.feasibleRate).toBeLessThanOrEqual(1);
    expect(s.deltas.length).toBe(50);
  });
});

describe("wrażliwość", () => {
  it("obejmuje każdą gałkę i jest posortowana malejąco po wpływie", () => {
    const knobs = knobsFor(LINES, null);
    const s = base(knobs, 20, 6);
    expect(s.sensitivity.length).toBe(knobs.length);
    for (let i = 1; i < s.sensitivity.length; i++) {
      expect(s.sensitivity[i - 1].swing).toBeGreaterThanOrEqual(s.sensitivity[i].swing);
    }
    for (const row of s.sensitivity) expect(row.swing).toBeCloseTo(Math.abs(row.high - row.low), 9);
  });

  it("gałka bez wpływu ma zerowy rozrzut", () => {
    const knobs: Knob[] = [{ key: "brak-takiej-galki", label: "Nieistniejąca", band: 0.4, evidence: "default" }];
    const s = base(knobs, 10, 8);
    expect(s.sensitivity[0].swing).toBeCloseTo(0, 9);
  });

  it("linia wyjęta z planu nie może być najbardziej wrażliwą gałką", () => {
    const lines: Line[] = LINES.filter((l) => l.id !== "pycha");
    const ctx: OptCtx = {
      lines,
      params: P,
      guards: DEFAULT_GUARDS,
      goal: DEFAULT_GOAL,
      allowed: buildAllowed(lines, DEFAULT_GUARDS),
      popSize: 40,
      mutation: 0.08,
    };
    const best = runOptimizer(initOptimizer(ctx, 9, []), ctx, 30).best;
    const s = stressTest({
      plan: best,
      reference: planFromCalendar(buildCalendar("sequential", 3), MIX, lines),
      lines,
      params: P,
      goal: DEFAULT_GOAL,
      knobs: knobsFor(LINES, null),
      n: 20,
      seed: 12,
    });
    expect(s.sensitivity.find((r) => r.key === "elast-pycha")!.swing).toBeCloseTo(0, 6);
  });
});

describe("werdykt", () => {
  it("mówi wprost, gdy plan nie bije dzisiejszego już w scenariuszu bazowym", () => {
    const p = presetPlan("protect");
    expect(stressVerdict(base(knobsFor(LINES, null), 10, 1, p, p)).tone).toBe("warn");
  });

  it("daje zielone światło tylko przy dodatnim ogonie", () => {
    const s = base(knobsFor(LINES, null).map((k) => ({ ...k, band: 0 })), 20, 1);
    const v = stressVerdict(s);
    expect(v.tone).toBe("ok");
    expect(v.text).toContain("obronić");
  });
});

describe("brief w zaburzonym rynku", () => {
  it("raportuje spełnialność progu osobno dla planu i dla dzisiejszego", () => {
    // Plan musi być szukany pod TEN sam próg, którym go potem mierzymy —
    // inaczej test sprawdza tylko tyle, że plan bez zobowiązania wolumenowego
    // nie dowozi wolumenu.
    const goal = { ...DEFAULT_GOAL, minLiters: 90000 };
    const reference = presetPlan("sequential");
    const ctx: OptCtx = {
      lines: LINES,
      params: P,
      guards: DEFAULT_GUARDS,
      goal,
      allowed: buildAllowed(LINES, DEFAULT_GUARDS),
      popSize: 40,
      mutation: 0.08,
    };
    const plan = runOptimizer(initOptimizer(ctx, 5, [reference]), ctx, 60).best;
    const s = stressTest({
      plan,
      reference,
      lines: LINES,
      params: P,
      goal,
      knobs: knobsFor(LINES, null),
      n: 60,
      seed: 31,
    });
    expect(s.refFeasibleRate).toBeGreaterThanOrEqual(0);
    expect(s.refFeasibleRate).toBeLessThanOrEqual(1);
    // plan optymalizowany pod ten próg dowozi go nie rzadziej niż preset
    expect(s.feasibleRate).toBeGreaterThanOrEqual(s.refFeasibleRate);
  });

  it("bez progów oba plany są zawsze dopuszczalne", () => {
    const s = base(knobsFor(LINES, null), 30, 5);
    expect(s.feasibleRate).toBe(1);
    expect(s.refFeasibleRate).toBe(1);
  });
});
