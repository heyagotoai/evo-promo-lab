import { describe, expect, it } from "vitest";
import { LINES, buildCalendar, simulate, totals, type Mechs, type SimParams } from "./lines";
import {
  DEFAULT_GOAL,
  DEFAULT_GUARDS,
  auditPlan,
  buildAllowed,
  calendarOf,
  evaluate,
  initOptimizer,
  planFromCalendar,
  runOptimizer,
  type OptCtx,
} from "./optimize";
import { advise, emptySituation } from "./advisor";
import { knobsFor, stressTest } from "./robust";
import { csvCell, planReport, plNum, reportFilename, toCSV, toTSV, tsvCell, type Row } from "./exportPlan";

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
const NOW = new Date(2026, 7, 20, 22, 5);

function report(withExtras: boolean): Row[] {
  const ctx: OptCtx = {
    lines: LINES,
    params: P,
    guards: DEFAULT_GUARDS,
    goal: DEFAULT_GOAL,
    allowed: buildAllowed(LINES, DEFAULT_GUARDS),
    popSize: 40,
    mutation: 0.08,
  };
  const reference = planFromCalendar(buildCalendar("sequential", 3), MIX, LINES);
  const s = runOptimizer(initOptimizer(ctx, 5, [reference]), ctx, 30);
  const ev = s.bestEval;
  const a = advise(emptySituation());
  return planReport({
    now: NOW,
    plan: s.best,
    rows: ev.rows,
    tot: ev.tot,
    lines: LINES,
    params: P,
    goal: DEFAULT_GOAL,
    seed: 5,
    generations: 30,
    baselineLabel: "Rotacja 1 po 1",
    baselineTot: totals(simulate(buildCalendar("sequential", 3), MIX, P)),
    checks: auditPlan(s.best, LINES, DEFAULT_GUARDS, P, ev),
    readings: withExtras ? a.readings : null,
    confidence: withExtras ? a.confidence : null,
    stress: withExtras
      ? stressTest({
          plan: s.best,
          reference,
          lines: LINES,
          params: P,
          goal: DEFAULT_GOAL,
          knobs: knobsFor(LINES, null),
          n: 20,
          seed: 1,
        })
      : null,
  });
}

const flat = (rows: Row[]) => rows.map((r) => r.join("|")).join("\n");

describe("formatowanie liczb", () => {
  it("używa przecinka dziesiętnego", () => {
    expect(plNum(1234.5, 2)).toBe("1234,50");
    expect(plNum(42)).toBe("42");
    expect(plNum(-17.25, 2)).toBe("-17,25");
  });

  it("nie udaje, że zna wartość nieskończoną", () => {
    expect(plNum(Infinity)).toBe("—");
    expect(plNum(NaN)).toBe("—");
  });
});

describe("CSV", () => {
  it("cytuje komórki ze średnikiem, cudzysłowem i nową linią", () => {
    expect(csvCell("zwykła")).toBe("zwykła");
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('ma "cudzysłów"')).toBe('"ma ""cudzysłów"""');
    expect(csvCell("dwie\nlinie")).toBe('"dwie\nlinie"');
  });

  it("skleja wiersze znacznikami końca linii Windows", () => {
    expect(toCSV([["a", "b"], ["c"]])).toBe("a;b\r\nc");
  });

  it("każdy wiersz da się z powrotem rozdzielić na tyle samo kolumn", () => {
    const rows = report(true);
    const csv = toCSV(rows);
    // Liczba niecytowanych średników w wierszu = liczba kolumn − 1
    const lines = csv.split("\r\n");
    expect(lines.length).toBe(rows.length);
    rows.forEach((r, i) => {
      const seps = lines[i].replace(/"(?:[^"]|"")*"/g, "").split(";").length - 1;
      expect(seps).toBe(Math.max(0, r.length - 1));
    });
  });
});

describe("TSV do schowka", () => {
  it("usuwa tabulatory i nowe linie z komórek, żeby nie rozjechać kolumn", () => {
    expect(tsvCell("a\tb")).toBe("a b");
    expect(tsvCell("dwie\nlinie")).toBe("dwie linie");
  });

  it("każdy wiersz ma dokładnie tyle tabulatorów, ile potrzeba", () => {
    const rows = report(true);
    const lines = toTSV(rows).split("\n");
    expect(lines.length).toBe(rows.length);
    rows.forEach((r, i) => {
      expect(lines[i].split("\t").length).toBe(Math.max(1, r.length));
    });
  });
});

describe("raport", () => {
  it("zawiera wszystkie sekcje", () => {
    const t = flat(report(true));
    for (const section of [
      "PLAN PROMOCJI — 12 TYGODNI",
      "PARAMETRY RYNKU",
      "CENNIK",
      "KALENDARZ",
      "EFEKTYWNA CENA ZA LITR",
      "PODSUMOWANIE",
      "REGUŁY I SKUTKI",
      "ODPORNOŚĆ NA NIEPEWNOŚĆ PARAMETRÓW",
    ]) {
      expect(t).toContain(section);
    }
  });

  it("ma dokładnie 12 wierszy kalendarza", () => {
    const rows = report(false);
    const start = rows.findIndex((r) => r[0] === "Tydzień");
    const weeks = rows.slice(start + 1, start + 13);
    expect(weeks.length).toBe(12);
    weeks.forEach((r, i) => expect(r[0]).toBe(String(i + 1)));
  });

  it("oznacza źródło każdego parametru", () => {
    const rows = report(true);
    const start = rows.findIndex((r) => r[0] === "Parametr" && r[2] === "Źródło");
    const params = rows.slice(start + 1).filter((r) => r.length === 3 && r[0] !== "");
    expect(params.length).toBeGreaterThan(4);
    for (const r of params.slice(0, 5)) {
      expect(["zmierzone", "zadeklarowane", "DOMYŚLNE"]).toContain(r[2]);
    }
  });

  it("bez scenariusza z Doradcy mówi wprost, że liczby są modelowe", () => {
    expect(flat(report(false))).toContain("wartości modelowe (syntetyczne) — nie pomiary");
    expect(flat(report(false))).not.toContain("ODPORNOŚĆ NA NIEPEWNOŚĆ");
  });

  it("zawsze kończy się zastrzeżeniem, czego model nie zna", () => {
    const rows = report(true);
    expect(rows[rows.length - 1][1]).toContain("listingu");
  });

  it("podsumowanie porównuje plan z dzisiejszym i liczy różnicę", () => {
    const rows = report(true);
    const i = rows.findIndex((r) => r[0] === "Marża 12 tyg. (zł)");
    expect(i).toBeGreaterThan(0);
    const [, plan, today, diff] = rows[i];
    const n = (s: string) => Number(s.replace(",", "."));
    expect(n(plan) - n(today)).toBeCloseTo(n(diff), 0);
  });

  it("oznacza tygodnie przycięte limitem łańcucha", () => {
    const ctx: OptCtx = {
      lines: LINES,
      params: { ...P, season: 1.4, cap: 6000 },
      guards: DEFAULT_GUARDS,
      goal: { ...DEFAULT_GOAL, objective: "liters" },
      allowed: buildAllowed(LINES, DEFAULT_GUARDS),
      popSize: 30,
      mutation: 0.08,
    };
    const s = runOptimizer(initOptimizer(ctx, 3, []), ctx, 20);
    const rows = planReport({
      now: NOW,
      plan: s.best,
      rows: s.bestEval.rows,
      tot: s.bestEval.tot,
      lines: LINES,
      params: ctx.params,
      goal: ctx.goal,
      seed: 3,
      generations: 20,
      baselineLabel: "Rotacja 1 po 1",
      baselineTot: s.bestEval.tot,
      checks: auditPlan(s.best, LINES, DEFAULT_GUARDS, ctx.params, s.bestEval),
      readings: null,
      confidence: null,
      stress: null,
    });
    expect(flat(rows)).toContain("PRZYCIĘTY");
  });

  it("kalendarz w raporcie zgadza się z planem", () => {
    const ctx: OptCtx = {
      lines: LINES,
      params: P,
      guards: DEFAULT_GUARDS,
      goal: DEFAULT_GOAL,
      allowed: buildAllowed(LINES, DEFAULT_GUARDS),
      popSize: 30,
      mutation: 0.08,
    };
    const s = runOptimizer(initOptimizer(ctx, 15, [planFromCalendar(buildCalendar("protect", 3), MIX, LINES)]), ctx, 25);
    const ev = evaluate(s.best, LINES, P, DEFAULT_GOAL);
    const cal = calendarOf(s.best, LINES);
    const rows = planReport({
      now: NOW,
      plan: s.best,
      rows: ev.rows,
      tot: ev.tot,
      lines: LINES,
      params: P,
      goal: DEFAULT_GOAL,
      seed: 15,
      generations: 25,
      baselineLabel: "Chroń premium",
      baselineTot: ev.tot,
      checks: [],
      readings: null,
      confidence: null,
      stress: null,
    });
    const start = rows.findIndex((r) => r[0] === "Tydzień");
    for (let w = 0; w < 12; w++) {
      const cell = rows[start + 1 + w][2];
      if (cal[w].length === 0) expect(cell).toBe("—");
      else for (const id of cal[w]) expect(cell).toContain(LINES.find((l) => l.id === id)!.name);
    }
  });
});

describe("nazwa pliku", () => {
  it("niesie datę i godzinę, żeby dwa eksporty się nie nadpisały", () => {
    expect(reportFilename(NOW)).toBe("plan-promo-20260820-2205.csv");
    expect(reportFilename(new Date(2026, 0, 2, 3, 4))).toBe("plan-promo-20260102-0304.csv");
  });
});
