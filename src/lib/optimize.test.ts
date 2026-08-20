import { describe, expect, it } from "vitest";
import {
  LINES,
  MECH_BY_ID,
  WEEKS,
  buildCalendar,
  effectiveZlPerLiter,
  filterCalendar,
  simulate,
  totals,
  zlL,
  type LineId,
  type Mechs,
  type SimParams,
} from "./lines";
import {
  DEFAULT_GOAL,
  DEFAULT_GUARDS,
  NO_MECHS,
  allowedMechs,
  auditPlan,
  buildAllowed,
  calendarOf,
  evaluate,
  initOptimizer,
  planFromCalendar,
  repair,
  runOptimizer,
  type Guards,
  type OptCtx,
  type Plan,
} from "./optimize";
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
const IDS: LineId[] = ["euforia", "retro", "pycha", "flirt"];

function ctxOf(g: Guards = DEFAULT_GUARDS, lines = LINES): OptCtx {
  return { lines, params: P, guards: g, goal: DEFAULT_GOAL, allowed: buildAllowed(lines, g), popSize: 40, mutation: 0.08 };
}

function randomPlan(seed: number, lines = LINES): Plan {
  const rng = makeRng(seed);
  const all = Object.keys(MECH_BY_ID) as (keyof typeof MECH_BY_ID)[];
  return Array.from({ length: WEEKS }, () => {
    const w = { ...NO_MECHS };
    for (const l of lines) w[l.id] = all[Math.floor(rng() * all.length)];
    return w;
  });
}

const isOn = (m: string) => MECH_BY_ID[m as keyof typeof MECH_BY_ID].kind !== "off";

describe("dozwolone mechaniki", () => {
  it("kotwica nie dostaje mechaniki łamiącej drabinę zł/L", () => {
    const eu = LINES.find((l) => l.id === "euforia")!;
    const fl = LINES.find((l) => l.id === "flirt")!;
    const ok = allowedMechs(eu, LINES, { ...DEFAULT_GUARDS, maxDepth: { ...DEFAULT_GUARDS.maxDepth, euforia: 0.5 } });
    for (const m of ok) expect(effectiveZlPerLiter(eu, MECH_BY_ID[m])).toBeGreaterThanOrEqual(zlL(fl) - 1e-9);
    expect(ok).not.toContain("g22");
  });

  it("tryb strict trzyma premium nad średnią półką", () => {
    const eu = LINES.find((l) => l.id === "euforia")!;
    const loose = allowedMechs(eu, LINES, { ...DEFAULT_GUARDS, maxDepth: { ...DEFAULT_GUARDS.maxDepth, euforia: 0.5 } });
    const strict = allowedMechs(eu, LINES, {
      ...DEFAULT_GUARDS,
      ladder: "strict",
      maxDepth: { ...DEFAULT_GUARDS.maxDepth, euforia: 0.5 },
    });
    expect(strict.length).toBeLessThan(loose.length);
    for (const m of strict) expect(effectiveZlPerLiter(eu, MECH_BY_ID[m])).toBeGreaterThanOrEqual(17 - 1e-9);
  });

  it("zakaz gratisów wycina 1+1, 2+1 i 2+2", () => {
    const re = LINES.find((l) => l.id === "retro")!;
    const ok = allowedMechs(re, LINES, {
      ...DEFAULT_GUARDS,
      allowGratis: { ...DEFAULT_GUARDS.allowGratis, retro: false },
      anchor: { euforia: false, retro: false, pycha: false, flirt: false },
    });
    for (const g of ["g11", "g21", "g22"]) expect(ok).not.toContain(g);
  });
});

describe("naprawa planu", () => {
  const guardSets: Guards[] = [
    DEFAULT_GUARDS,
    { ...DEFAULT_GUARDS, maxBurst: 1, minGap: 2, maxLinesPerWeek: 1, minSilentWeeks: 4 },
    { ...DEFAULT_GUARDS, ladder: "strict", maxLinesPerWeek: 3, minSilentWeeks: 0, minGap: 0 },
    {
      ...DEFAULT_GUARDS,
      forbidPairs: [
        ["retro", "pycha"],
        ["euforia", "flirt"],
      ],
      maxPromoWeeks: { euforia: 1, retro: 2, pycha: 2, flirt: 3 },
    },
  ];

  it("z każdego losowego planu robi plan legalny", () => {
    for (const g of guardSets) {
      const ctx = ctxOf(g);
      for (let seed = 1; seed <= 40; seed++) {
        const plan = repair(randomPlan(seed), ctx.lines, g, ctx.allowed);
        const ev = evaluate(plan, ctx.lines, P, DEFAULT_GOAL);
        const checks = auditPlan(plan, ctx.lines, g, P, ev).filter((c) => c.kind === "rule");
        for (const c of checks) expect(`${c.rule}: ${c.detail}`).toBe(c.ok ? `${c.rule}: ${c.detail}` : "OK");
      }
    }
  });

  it("jest idempotentna", () => {
    const ctx = ctxOf();
    for (let seed = 1; seed <= 20; seed++) {
      const once = repair(randomPlan(seed), ctx.lines, ctx.guards, ctx.allowed);
      const twice = repair(once, ctx.lines, ctx.guards, ctx.allowed);
      expect(twice).toEqual(once);
    }
  });

  it("nigdy nie pogłębia promocji ani nie dokłada tygodni", () => {
    const ctx = ctxOf();
    for (let seed = 1; seed <= 20; seed++) {
      const raw = randomPlan(seed);
      const fixed = repair(raw, ctx.lines, ctx.guards, ctx.allowed);
      for (let w = 0; w < WEEKS; w++) {
        for (const id of IDS) {
          const a = MECH_BY_ID[raw[w][id]].depth;
          const b = MECH_BY_ID[fixed[w][id]].depth;
          expect(b).toBeLessThanOrEqual(a + 1e-9);
        }
      }
    }
  });

  it("nie rusza planu, który już jest legalny", () => {
    const ctx = ctxOf();
    const plan: Plan = Array.from({ length: WEEKS }, (_, w) => {
      const week = { ...NO_MECHS };
      if (w < 3) week.flirt = "g11";
      if (w >= 4 && w < 7) week.pycha = "g21";
      if (w >= 8 && w < 11) week.retro = "d20";
      return week;
    });
    expect(repair(plan, ctx.lines, ctx.guards, ctx.allowed)).toEqual(plan);
  });

  it("odcina linię wyjętą z planu", () => {
    const lines = LINES.filter((l) => l.id !== "pycha");
    const ctx = ctxOf(DEFAULT_GUARDS, lines);
    const fixed = repair(randomPlan(7), lines, ctx.guards, ctx.allowed);
    for (let w = 0; w < WEEKS; w++) expect(fixed[w].pycha).toBe("none");
  });
});

describe("kalendarz z planu", () => {
  it("linia jest w gazetce dokładnie wtedy, gdy ma mechanikę", () => {
    const ctx = ctxOf();
    const plan = repair(randomPlan(3), ctx.lines, ctx.guards, ctx.allowed);
    const cal = calendarOf(plan, ctx.lines);
    for (let w = 0; w < WEEKS; w++) {
      for (const id of IDS) expect(cal[w].includes(id)).toBe(isOn(plan[w][id]));
    }
  });
});

describe("ocena i porządek", () => {
  it("plan dopuszczalny bije niedopuszczalny nawet o niższej marży", () => {
    const ctx = ctxOf();
    const goal = { ...DEFAULT_GOAL, minLiters: 1e9 };
    const plan = repair(randomPlan(5), ctx.lines, ctx.guards, ctx.allowed);
    const ev = evaluate(plan, ctx.lines, P, goal);
    expect(ev.feasible).toBe(false);
    expect(ev.violation).toBeGreaterThan(0);
  });

  it("bez twardych progów każdy plan jest dopuszczalny", () => {
    const ctx = ctxOf();
    const plan = repair(randomPlan(9), ctx.lines, ctx.guards, ctx.allowed);
    expect(evaluate(plan, ctx.lines, P, DEFAULT_GOAL).feasible).toBe(true);
  });
});

describe("algorytm ewolucyjny", () => {
  const presetSeeds = () =>
    ["protect", "sequential", "twoFar", "twoNear", "alwaysFlirt", "allOn"].map((id) =>
      planFromCalendar(buildCalendar(id, 3), MIX, LINES),
    );

  const bestPreset = () =>
    Math.max(
      ...["protect", "sequential", "twoFar", "twoNear", "alwaysFlirt", "allOn"].map(
        (id) =>
          totals(
            simulate(
              filterCalendar(buildCalendar(id, 3), { euforia: true, retro: true, pycha: true, flirt: true }),
              MIX,
              P,
            ),
          ).margin,
      ),
    );

  it("jest powtarzalny: ten sam seed daje ten sam plan", () => {
    const ctx = ctxOf();
    const a = runOptimizer(initOptimizer(ctx, 42, presetSeeds()), ctx, 15);
    const b = runOptimizer(initOptimizer(ctx, 42, presetSeeds()), ctx, 15);
    expect(b.best).toEqual(a.best);
    expect(b.bestEval.value).toBeCloseTo(a.bestEval.value, 6);
  });

  it("różne seedy dają różne przebiegi", () => {
    const ctx = ctxOf();
    const a = runOptimizer(initOptimizer(ctx, 1, presetSeeds()), ctx, 10);
    const b = runOptimizer(initOptimizer(ctx, 2, presetSeeds()), ctx, 10);
    expect(a.history).not.toEqual(b.history);
  });

  it("nigdy się nie cofa — najlepszy wynik jest niemalejący", () => {
    const ctx = ctxOf();
    const s = runOptimizer(initOptimizer(ctx, 7, presetSeeds()), ctx, 40);
    for (let i = 1; i < s.history.length; i++) expect(s.history[i]).toBeGreaterThanOrEqual(s.history[i - 1] - 1e-6);
  });

  it("bije najlepszy preset przy tych samych regułach", () => {
    const ctx = ctxOf();
    const s = runOptimizer(initOptimizer(ctx, 11, presetSeeds()), ctx, 60);
    expect(s.bestEval.tot.margin).toBeGreaterThan(bestPreset());
  });

  it("zwraca plan, który przechodzi pełny audyt reguł", () => {
    const g: Guards = { ...DEFAULT_GUARDS, maxBurst: 2, minGap: 2, maxLinesPerWeek: 1, minSilentWeeks: 3 };
    const ctx = ctxOf(g);
    const s = runOptimizer(initOptimizer(ctx, 21, presetSeeds()), ctx, 40);
    const checks = auditPlan(s.best, ctx.lines, g, P, s.bestEval).filter((c) => c.kind === "rule");
    for (const c of checks) expect(`${c.rule} → ${c.detail}`).toBe(c.ok ? `${c.rule} → ${c.detail}` : "ZŁAMANA");
  });

  it("umie znaleźć plan, który ani razu nie przebija limitu łańcucha", () => {
    // Upał podnosi bazę do ~7,8 tys. L, więc każda akcja przebija sufit 9 tys. L.
    const params = { ...P, season: 1.4, cap: 9000 };
    const goal = { ...DEFAULT_GOAL, objective: "liters" as const };
    const base = { ...ctxOf(), params, goal };
    const loose = runOptimizer(initOptimizer(base, 17, presetSeeds()), base, 40);
    expect(loose.bestEval.cappedWeeks).toBeGreaterThan(0);
    const tight = { ...base, goal: { ...goal, noCapOverflow: true } };
    const s = runOptimizer(initOptimizer(tight, 17, presetSeeds()), tight, 60);
    expect(s.bestEval.feasible).toBe(true);
    expect(s.bestEval.cappedWeeks).toBe(0);
    expect(s.bestEval.rows.every((r) => !r.capped)).toBe(true);
  });

  it("umie szukać litrów przy twardym progu marży", () => {
    const ctx = { ...ctxOf(), goal: { ...DEFAULT_GOAL, objective: "liters" as const, minMargin: 400000 } };
    const s = runOptimizer(initOptimizer(ctx, 13, presetSeeds()), ctx, 60);
    expect(s.bestEval.feasible).toBe(true);
    expect(s.bestEval.tot.margin).toBeGreaterThanOrEqual(400000);
    const marginRun = ctxOf();
    const m = runOptimizer(initOptimizer(marginRun, 13, presetSeeds()), marginRun, 60);
    expect(s.bestEval.tot.liters).toBeGreaterThan(m.bestEval.tot.liters);
  });
});
