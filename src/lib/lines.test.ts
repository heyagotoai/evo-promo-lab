import { describe, expect, it } from "vitest";
import {
  CANNIBAL_FLOOR,
  LINES,
  MAX_LIFT,
  MECH_BY_ID,
  WEEKS,
  affinity,
  buildCalendar,
  effectiveZlPerLiter,
  simulate,
  totals,
  zlL,
  type LineId,
  type Line,
  type Mechs,
  type SimParams,
} from "./lines";

const NO_PROMO: Mechs = { euforia: "none", retro: "none", pycha: "none", flirt: "none" };
const MIX: Mechs = { euforia: "d10", retro: "d20", pycha: "g21", flirt: "g11" };

const P: SimParams = {
  season: 1,
  cannibal: 0.4,
  fatigue: 0.14,
  pantry: 0.12,
  elastScale: 1,
  capMode: "liters",
  cap: 1e9,
};

const silent = (): LineId[][] => Array.from({ length: WEEKS }, () => [] as LineId[]);

function weeksOn(on: LineId[], from: number, len: number): LineId[][] {
  const cal = silent();
  for (let i = 0; i < len; i++) cal[from + i] = on.slice();
  return cal;
}

describe("baza", () => {
  it("bez gazetki sprzedaje dokładnie bazę razy sezon", () => {
    const rows = simulate(silent(), NO_PROMO, P);
    for (const r of rows) {
      for (const l of LINES) expect(r.packs[l.id]).toBeCloseTo(l.basePacks, 6);
    }
  });

  it("sezon skaluje wszystkie linie proporcjonalnie", () => {
    const a = totals(simulate(silent(), NO_PROMO, P));
    const b = totals(simulate(silent(), NO_PROMO, { ...P, season: 1.4 }));
    expect(b.liters / a.liters).toBeCloseTo(1.4, 6);
    expect(b.margin / a.margin).toBeCloseTo(1.4, 6);
  });
});

describe("dołek spiżarni", () => {
  it("nie odpala zanim jakakolwiek promocja się wydarzyła", () => {
    const cal = weeksOn(["flirt"], 4, 2);
    const rows = simulate(cal, MIX, { ...P, pantry: 0.22 });
    // tygodnie 1-4: Flirt jeszcze nie był w gazetce, więc żadnego dołka
    for (let w = 0; w < 4; w++) expect(rows[w].packs.flirt).toBeCloseTo(2100, 6);
  });

  it("odpala dopiero po zakończonej fali i wygasa po 2 tygodniach", () => {
    const cal = weeksOn(["flirt"], 0, 2);
    const rows = simulate(cal, MIX, { ...P, cannibal: 0, pantry: 0.2 });
    expect(rows[2].packs.flirt).toBeLessThan(2100);
    expect(rows[3].packs.flirt).toBeLessThan(2100);
    expect(rows[4].packs.flirt).toBeCloseTo(2100, 6);
  });

  it("gratis kopie głębszy dołek niż procent", () => {
    const cal = weeksOn(["retro"], 0, 2);
    const pct = simulate(cal, { ...MIX, retro: "d50" }, { ...P, cannibal: 0 });
    const gratis = simulate(cal, { ...MIX, retro: "g11" }, { ...P, cannibal: 0 });
    expect(gratis[2].packs.retro).toBeLessThan(pct[2].packs.retro);
  });
});

describe("kanibalizacja", () => {
  it("nie zależy od kolejności linii w tablicy", () => {
    const cal = buildCalendar("allOn", 3);
    const mech: Mechs = { euforia: "d10", retro: "g11", pycha: "g11", flirt: "g11" };
    const a = totals(simulate(cal, mech, { ...P, cannibal: 0.65 }, LINES));
    const b = totals(simulate(cal, mech, { ...P, cannibal: 0.65 }, [...LINES].reverse()));
    expect(b.margin).toBeCloseTo(a.margin, 4);
    expect(b.liters).toBeCloseTo(a.liters, 4);
  });

  it("jest symetryczna: kto kradnie, temu też można ukraść", () => {
    for (const a of LINES) for (const b of LINES) expect(affinity(a.id, b.id)).toBe(affinity(b.id, a.id));
    expect(affinity("euforia", "euforia")).toBe(0);
  });

  it("Retro–Pycha kradnie mocniej niż Euforia–Flirt", () => {
    const one = (a: LineId, b: LineId) => {
      const rows = simulate(weeksOn([a], 0, 1), { ...MIX, [a]: "d50" } as Mechs, { ...P, cannibal: 0.65 });
      return rows[0].packs[b] / (LINES.find((l) => l.id === b)!.basePacks);
    };
    expect(one("pycha", "retro")).toBeLessThan(one("flirt", "euforia"));
  });

  it("nie schodzi poniżej podłogi linii kradzionej", () => {
    const rows = simulate(weeksOn(["flirt"], 0, 1), { ...MIX, flirt: "g22" }, { ...P, cannibal: 1 });
    for (const l of LINES) {
      if (l.id === "flirt") continue;
      expect(rows[0].packs[l.id]).toBeGreaterThanOrEqual(l.basePacks * CANNIBAL_FLOOR - 1e-6);
    }
  });

  it("podłoga skaluje się z linią kradzioną, nie kradnącą", () => {
    // Euforia (baza 700) kradnąca Retro nie może narzucić Retro podłogi ze swojej bazy
    const rows = simulate(weeksOn(["euforia"], 0, 1), { ...MIX, euforia: "d50" }, { ...P, cannibal: 1 });
    expect(rows[0].packs.retro).toBeGreaterThan(700 * CANNIBAL_FLOOR);
  });

  it("linia poza planem nie pochłania kradzieży w próżnię", () => {
    const cal = weeksOn(["flirt"], 0, 1);
    const withAll = simulate(cal, MIX, { ...P, cannibal: 0.5 }, LINES);
    const withoutEuforia = simulate(
      cal,
      MIX,
      { ...P, cannibal: 0.5 },
      LINES.filter((l) => l.id !== "euforia"),
    );
    // Retro i Pycha przejmują udział Euforii, więc tracą więcej, nie mniej
    expect(withoutEuforia[0].packs.retro).toBeLessThan(withAll[0].packs.retro);
    expect(withoutEuforia[0].packs.pycha).toBeLessThan(withAll[0].packs.pycha);
  });
});

describe("zmęczenie fali", () => {
  it("każdy kolejny tydzień tej samej naklejki sprzedaje mniej", () => {
    const rows = simulate(weeksOn(["retro"], 0, 5), { ...MIX, retro: "d30" }, { ...P, cannibal: 0, fatigue: 0.14 });
    for (let w = 1; w < 5; w++) expect(rows[w].packs.retro).toBeLessThan(rows[w - 1].packs.retro);
  });

  it("nigdy nie schodzi poniżej 35% siły promocji", () => {
    const rows = simulate(weeksOn(["retro"], 0, 12), { ...MIX, retro: "d30" }, { ...P, cannibal: 0, fatigue: 0.9 });
    const base = LINES.find((l) => l.id === "retro")!;
    const minLift = base.elasticity * 0.3 * 0.35;
    expect(rows[11].packs.retro).toBeGreaterThanOrEqual(base.basePacks * (1 + minLift) - 1e-6);
  });
});

describe("sufit liftu", () => {
  it("lift nie przekracza MAX_LIFT nawet przy skrajnych gałkach", () => {
    const wild: Line[] = LINES.map((l) => ({ ...l, elasticity: 40 }));
    const rows = simulate(weeksOn(["flirt"], 0, 1), { ...MIX, flirt: "d50" }, { ...P, cannibal: 0, elastScale: 3 }, wild);
    const base = wild.find((l) => l.id === "flirt")!;
    expect(rows[0].packs.flirt).toBeCloseTo(base.basePacks * (1 + MAX_LIFT) * 1, 4);
  });
});

describe("limit łańcucha", () => {
  it("przycina tydzień do limitu i oznacza go", () => {
    const rows = simulate(buildCalendar("allOn", 3), { euforia: "d10", retro: "g22", pycha: "g22", flirt: "g22" }, {
      ...P,
      season: 1.4,
      cap: 6000,
    });
    for (const r of rows) expect(r.liters).toBeLessThanOrEqual(6000 + 1e-6);
    expect(rows.some((r) => r.capped)).toBe(true);
  });

  it("przycięcie skaluje marżę linii razem z całością", () => {
    const params = { ...P, cap: 6000 };
    const rows = simulate(buildCalendar("allOn", 3), MIX, params);
    for (const r of rows) {
      const sum = LINES.reduce((s, l) => s + r.lineMargin[l.id], 0);
      expect(sum).toBeCloseTo(r.margin, 4);
    }
  });
});

describe("mechanika tydzień po tygodniu", () => {
  it("plan per-tydzień daje ten sam wynik co globalny, gdy wszystkie tygodnie są równe", () => {
    const cal = buildCalendar("sequential", 3);
    const global = totals(simulate(cal, MIX, P));
    const perWeek = totals(simulate(cal, Array.from({ length: WEEKS }, () => MIX), P));
    expect(perWeek.margin).toBeCloseTo(global.margin, 6);
  });

  it("pozwala zmienić mechanikę w środku horyzontu", () => {
    const cal = weeksOn(["flirt"], 0, 12);
    const plan = Array.from({ length: WEEKS }, (_, w) => ({ ...MIX, flirt: w < 6 ? "d10" : "g11" }) as Mechs);
    const rows = simulate(cal, plan, { ...P, cannibal: 0, fatigue: 0 });
    expect(rows[6].packs.flirt).toBeGreaterThan(rows[5].packs.flirt);
  });
});

describe("drabina zł/L", () => {
  it("2+2 to dokładnie połowa ceny za litr", () => {
    const py = LINES.find((l) => l.id === "pycha")!;
    expect(effectiveZlPerLiter(py, MECH_BY_ID.g22)).toBeCloseTo(zlL(py) / 2, 6);
  });

  it("2+1 jest płytsze niż 1+1", () => {
    const fl = LINES.find((l) => l.id === "flirt")!;
    expect(effectiveZlPerLiter(fl, MECH_BY_ID.g21)).toBeGreaterThan(effectiveZlPerLiter(fl, MECH_BY_ID.g11));
  });

  it("Euforia na 2+2 schodzi poniżej regularnego Flirt", () => {
    const eu = LINES.find((l) => l.id === "euforia")!;
    const fl = LINES.find((l) => l.id === "flirt")!;
    expect(effectiveZlPerLiter(eu, MECH_BY_ID.g22)).toBeLessThan(zlL(fl));
  });
});
