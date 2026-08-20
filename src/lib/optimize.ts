import { makeRng, type Rng } from "./rng";
import {
  LINES,
  MECHS,
  MECH_BY_ID,
  WEEKS,
  effectiveZlPerLiter,
  simulate,
  totals,
  zlL,
  type Line,
  type LineId,
  type Mech,
  type MechId,
  type Mechs,
  type SimParams,
  type Totals,
  type WeekRow,
} from "./lines";

/** Plan = mechanika każdej linii w każdym z 12 tygodni. "none" = nie ma jej w gazetce. */
export type Plan = Mechs[];

export type LadderRule = "off" | "cheapest" | "strict";

export type Guards = {
  /** Sufit głębokości promocji na linię (0,2 = maksimum −20% / równoważnik). */
  maxDepth: Record<LineId, number>;
  /** Czy linia może w ogóle iść w mechanice gratisowej. */
  allowGratis: Record<LineId, boolean>;
  /** Maksymalna liczba kolejnych tygodni tej samej linii w gazetce. */
  maxBurst: number;
  /** Ile tygodni ciszy musi być po fali, zanim linia wróci. */
  minGap: number;
  /** Maksimum tygodni w gazetce na linię w całych 12. */
  maxPromoWeeks: Record<LineId, number>;
  /** Ile linii naraz wolno wystawić w jednym tygodniu. */
  maxLinesPerWeek: number;
  /** Ile tygodni w 12 musi być całkiem bez gazetki. */
  minSilentWeeks: number;
  /** Pary, których nie wolno postawić w tym samym tygodniu. */
  forbidPairs: [LineId, LineId][];
  /** Ochrona drabiny zł/L linii-kotwicy. */
  ladder: LadderRule;
  /** Które linie są kotwicą pełnej ceny. */
  anchor: Record<LineId, boolean>;
};

export type Objective = "margin" | "liters" | "revenue";

export type Goal = {
  objective: Objective;
  /** Twarde progi — plan, który ich nie spełnia, przegrywa z każdym, który spełnia. */
  minMargin: number;
  minLiters: number;
  minWeekMargin: number;
  minFullPriceEuforia: number;
  /** Żaden tydzień nie może przekroczyć limitu łańcucha — nadwyżka i tak nie dojedzie. */
  noCapOverflow: boolean;
};

export const DEFAULT_GUARDS: Guards = {
  maxDepth: { euforia: 0.2, retro: 0.5, pycha: 0.5, flirt: 0.5 },
  allowGratis: { euforia: false, retro: true, pycha: true, flirt: true },
  maxBurst: 3,
  minGap: 1,
  maxPromoWeeks: { euforia: 2, retro: 5, pycha: 5, flirt: 6 },
  maxLinesPerWeek: 2,
  minSilentWeeks: 2,
  forbidPairs: [["retro", "pycha"]],
  ladder: "cheapest",
  anchor: { euforia: true, retro: false, pycha: false, flirt: false },
};

export const DEFAULT_GOAL: Goal = {
  objective: "margin",
  minMargin: 0,
  minLiters: 0,
  minWeekMargin: 0,
  minFullPriceEuforia: 0,
  noCapOverflow: false,
};

export const NO_MECHS: Mechs = { euforia: "none", retro: "none", pycha: "none", flirt: "none" };

/* ---------------------------------------------------------------- dozwolone mechaniki */

/**
 * Podłoga zł/L dla linii-kotwicy: efektywna cena litra w promocji nie może
 * zejść poniżej regularnej ceny litra linii tańszej ("cheapest") albo
 * najdroższej z pozostałych ("strict" — premium nie wchodzi w średnią półkę).
 */
export function ladderFloor(line: Line, lines: Line[], g: Guards): number {
  if (g.ladder === "off" || !g.anchor[line.id]) return 0;
  const cheaper = lines.filter((o) => o.id !== line.id && zlL(o) < zlL(line)).map(zlL);
  if (!cheaper.length) return 0;
  return g.ladder === "strict" ? Math.max(...cheaper) : Math.min(...cheaper);
}

export function allowedMechs(line: Line, lines: Line[], g: Guards): MechId[] {
  const floor = ladderFloor(line, lines, g);
  return MECHS.filter((m: Mech) => {
    if (m.kind === "off") return true;
    if (m.depth > g.maxDepth[line.id] + 1e-9) return false;
    if (m.kind === "gratis" && !g.allowGratis[line.id]) return false;
    if (floor > 0 && effectiveZlPerLiter(line, m) < floor - 1e-9) return false;
    return true;
  }).map((m) => m.id);
}

export type Allowed = Record<LineId, MechId[]>;

export function buildAllowed(lines: Line[], g: Guards): Allowed {
  const out = { ...NO_MECHS } as unknown as Allowed;
  for (const id of ["euforia", "retro", "pycha", "flirt"] as LineId[]) {
    const line = lines.find((l) => l.id === id);
    out[id] = line ? allowedMechs(line, lines, g) : ["none"];
  }
  return out;
}

/* ---------------------------------------------------------------- naprawa planu */

const depthOf = (m: MechId) => MECH_BY_ID[m].depth;
const isOn = (m: MechId) => MECH_BY_ID[m].kind !== "off";

function idsOf(lines: Line[]): LineId[] {
  return lines.map((l) => l.id);
}

/**
 * Sprowadza dowolny plan do planu legalnego. Naprawa tylko wyłącza albo spłyca
 * promocje — nigdy nie dokłada. Dzięki temu wynik optymalizatora zawsze da się
 * puścić do gazetki bez ręcznego sprawdzania reguł.
 */
export function repair(plan: Plan, lines: Line[], g: Guards, allowed: Allowed): Plan {
  const ids = idsOf(lines);
  const out: Plan = plan.map((w) => ({ ...NO_MECHS, ...w }));

  const clampWeek = (w: number) => {
    for (const id of ids) {
      const m = out[w][id];
      if (!allowed[id].includes(m)) {
        const same = allowed[id]
          .filter((a) => MECH_BY_ID[a].kind === MECH_BY_ID[m].kind && depthOf(a) <= depthOf(m))
          .sort((a, b) => depthOf(b) - depthOf(a))[0];
        out[w][id] = same ?? "none";
      }
    }
    for (const key of Object.keys(out[w]) as LineId[]) if (!ids.includes(key)) out[w][key] = "none";
  };

  const pairs = (w: number) => {
    for (const [a, b] of g.forbidPairs) {
      if (!ids.includes(a) || !ids.includes(b)) continue;
      if (isOn(out[w][a]) && isOn(out[w][b])) {
        const drop = depthOf(out[w][a]) < depthOf(out[w][b]) ? a : depthOf(out[w][b]) < depthOf(out[w][a]) ? b : b;
        out[w][drop] = "none";
      }
    }
  };

  const perWeekCount = (w: number) => {
    const on = ids.filter((id) => isOn(out[w][id]));
    if (on.length <= g.maxLinesPerWeek) return;
    const keep = on
      .slice()
      .sort((a, b) => depthOf(out[w][b]) - depthOf(out[w][a]) || ids.indexOf(a) - ids.indexOf(b))
      .slice(0, g.maxLinesPerWeek);
    for (const id of on) if (!keep.includes(id)) out[w][id] = "none";
  };

  const burstAndGap = () => {
    for (const id of ids) {
      let streak = 0;
      let cooldown = 0;
      for (let w = 0; w < WEEKS; w++) {
        if (cooldown > 0) {
          if (isOn(out[w][id])) out[w][id] = "none";
          cooldown -= 1;
          continue;
        }
        if (isOn(out[w][id])) {
          streak += 1;
          if (streak > g.maxBurst) {
            out[w][id] = "none";
            streak = 0;
            cooldown = Math.max(0, g.minGap - 1);
          }
        } else {
          if (streak > 0) cooldown = Math.max(0, g.minGap - 1);
          streak = 0;
        }
      }
    }
  };

  const weekBudget = () => {
    for (const id of ids) {
      const on = [];
      for (let w = 0; w < WEEKS; w++) if (isOn(out[w][id])) on.push(w);
      const over = on.length - g.maxPromoWeeks[id];
      if (over <= 0) continue;
      const drop = on
        .slice()
        .sort((a, b) => depthOf(out[a][id]) - depthOf(out[b][id]) || b - a)
        .slice(0, over);
      for (const w of drop) out[w][id] = "none";
    }
  };

  const silence = () => {
    const silentCount = () => {
      let n = 0;
      for (let w = 0; w < WEEKS; w++) if (!ids.some((id) => isOn(out[w][id]))) n += 1;
      return n;
    };
    let guard = 0;
    while (silentCount() < g.minSilentWeeks && guard++ < WEEKS) {
      let worst = -1;
      let worstDepth = Infinity;
      for (let w = 0; w < WEEKS; w++) {
        const d = ids.reduce((s, id) => s + depthOf(out[w][id]), 0);
        if (d > 0 && d < worstDepth) {
          worstDepth = d;
          worst = w;
        }
      }
      if (worst < 0) break;
      for (const id of ids) out[worst][id] = "none";
    }
  };

  for (let w = 0; w < WEEKS; w++) {
    clampWeek(w);
    pairs(w);
    perWeekCount(w);
  }
  burstAndGap();
  weekBudget();
  silence();
  burstAndGap();
  return out;
}

export function calendarOf(plan: Plan, lines: Line[]): LineId[][] {
  const ids = idsOf(lines);
  return plan.map((w) => ids.filter((id) => isOn(w[id])));
}

/* ---------------------------------------------------------------- ocena */

export type Eval = {
  feasible: boolean;
  /** Suma względnych niedoborów wobec twardych progów. 0 = plan spełnia wszystko. */
  violation: number;
  value: number;
  tot: Totals;
  rows: WeekRow[];
  worstWeek: number;
  cappedWeeks: number;
};

function primaryOf(t: Totals, o: Objective): number {
  return o === "margin" ? t.margin : o === "liters" ? t.liters : t.revenue;
}

export function evaluate(
  plan: Plan,
  lines: Line[],
  p: SimParams,
  goal: Goal,
): Eval {
  const rows = simulate(calendarOf(plan, lines), plan, p, lines);
  const tot = totals(rows);
  const worstWeek = rows.reduce((m, r) => Math.min(m, r.margin), Infinity);
  let violation = 0;
  const short = (have: number, need: number) => (need > 0 && have < need ? (need - have) / Math.abs(need) : 0);
  violation += short(tot.margin, goal.minMargin);
  violation += short(tot.liters, goal.minLiters);
  violation += short(tot.fullPriceEuforia, goal.minFullPriceEuforia);
  if (worstWeek < goal.minWeekMargin) {
    const scale = Math.max(1, Math.abs(goal.minWeekMargin), Math.abs(tot.margin) / WEEKS);
    violation += (goal.minWeekMargin - worstWeek) / scale;
  }
  const cappedWeeks = rows.filter((r) => r.capped).length;
  if (goal.noCapOverflow && cappedWeeks > 0) violation += cappedWeeks / WEEKS;
  return {
    feasible: violation <= 1e-9,
    violation,
    value: primaryOf(tot, goal.objective),
    tot,
    rows,
    worstWeek,
    cappedWeeks,
  };
}

/** Plan dopuszczalny bije niedopuszczalny; potem mniejsze złamanie; potem wyższy cel. */
export function better(a: Eval, b: Eval): boolean {
  if (a.feasible !== b.feasible) return a.feasible;
  if (!a.feasible) return a.violation < b.violation;
  return a.value > b.value;
}

/* ---------------------------------------------------------------- algorytm ewolucyjny */

export type OptState = {
  pop: Plan[];
  evals: Eval[];
  best: Plan;
  bestEval: Eval;
  gen: number;
  history: number[];
  rng: Rng;
};

export type OptCtx = {
  lines: Line[];
  params: SimParams;
  guards: Guards;
  goal: Goal;
  allowed: Allowed;
  popSize: number;
  mutation: number;
};

function emptyPlan(): Plan {
  return Array.from({ length: WEEKS }, () => ({ ...NO_MECHS }));
}

function randomPlan(rng: Rng, ctx: OptCtx, density: number): Plan {
  const plan = emptyPlan();
  for (let w = 0; w < WEEKS; w++) {
    for (const l of ctx.lines) {
      const opts = ctx.allowed[l.id].filter((m) => m !== "none");
      if (!opts.length || rng() > density) continue;
      plan[w][l.id] = opts[Math.floor(rng() * opts.length)];
    }
  }
  return repair(plan, ctx.lines, ctx.guards, ctx.allowed);
}

/** Preset przełożony na plan — startowa populacja zawiera to, co dziś robi zespół. */
export function planFromCalendar(calendar: LineId[][], mechs: Mechs, lines: Line[]): Plan {
  const ids = idsOf(lines);
  return Array.from({ length: WEEKS }, (_, w) => {
    const week = { ...NO_MECHS };
    for (const id of ids) if ((calendar[w] ?? []).includes(id)) week[id] = mechs[id];
    return week;
  });
}

function crossover(rng: Rng, a: Plan, b: Plan): Plan {
  // Krzyżowanie po tygodniach: dziecko bierze cały tydzień od jednego z rodziców,
  // więc udane układy „kto z kim w tym samym tygodniu" nie rozpadają się.
  return Array.from({ length: WEEKS }, (_, w) => ({ ...(rng() < 0.5 ? a[w] : b[w]) }));
}

function mutate(rng: Rng, plan: Plan, ctx: OptCtx): Plan {
  const out: Plan = plan.map((w) => ({ ...w }));
  for (let w = 0; w < WEEKS; w++) {
    for (const l of ctx.lines) {
      if (rng() >= ctx.mutation) continue;
      const opts = ctx.allowed[l.id];
      out[w][l.id] = opts[Math.floor(rng() * opts.length)];
    }
  }
  // Makro-ruchy: przesunięcie całej fali linii i zamiana dwóch tygodni.
  if (rng() < 0.25 && ctx.lines.length) {
    const l = ctx.lines[Math.floor(rng() * ctx.lines.length)];
    const dir = rng() < 0.5 ? -1 : 1;
    const col = out.map((x) => x[l.id]);
    for (let w = 0; w < WEEKS; w++) {
      const src = w - dir;
      out[w][l.id] = src >= 0 && src < WEEKS ? col[src] : "none";
    }
  }
  if (rng() < 0.2) {
    const i = Math.floor(rng() * WEEKS);
    const j = Math.floor(rng() * WEEKS);
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return repair(out, ctx.lines, ctx.guards, ctx.allowed);
}

function tournament(rng: Rng, pop: Plan[], evals: Eval[], k = 3): number {
  let best = Math.floor(rng() * pop.length);
  for (let i = 1; i < k; i++) {
    const c = Math.floor(rng() * pop.length);
    if (better(evals[c], evals[best])) best = c;
  }
  return best;
}

export function initOptimizer(ctx: OptCtx, seed: number, seeds: Plan[] = []): OptState {
  const rng = makeRng(seed);
  const pop: Plan[] = [];
  for (const s of seeds.slice(0, Math.floor(ctx.popSize / 3))) {
    pop.push(repair(s, ctx.lines, ctx.guards, ctx.allowed));
  }
  while (pop.length < ctx.popSize) {
    const density = 0.15 + 0.5 * rng();
    pop.push(randomPlan(rng, ctx, density));
  }
  const evals = pop.map((p) => evaluate(p, ctx.lines, ctx.params, ctx.goal));
  let bi = 0;
  for (let i = 1; i < evals.length; i++) if (better(evals[i], evals[bi])) bi = i;
  return {
    pop,
    evals,
    best: pop[bi],
    bestEval: evals[bi],
    gen: 0,
    history: [evals[bi].value],
    rng,
  };
}

export function stepOptimizer(state: OptState, ctx: OptCtx): OptState {
  const { rng } = state;
  const order = state.pop.map((_, i) => i).sort((a, b) => (better(state.evals[a], state.evals[b]) ? -1 : 1));
  const next: Plan[] = [state.pop[order[0]], state.pop[order[1]]].map((p) => p.map((w) => ({ ...w })));
  while (next.length < ctx.popSize) {
    const a = state.pop[tournament(rng, state.pop, state.evals)];
    const b = state.pop[tournament(rng, state.pop, state.evals)];
    const child = rng() < 0.85 ? crossover(rng, a, b) : a.map((w) => ({ ...w }));
    next.push(mutate(rng, child, ctx));
  }
  const evals = next.map((p) => evaluate(p, ctx.lines, ctx.params, ctx.goal));
  let bi = 0;
  for (let i = 1; i < evals.length; i++) if (better(evals[i], evals[bi])) bi = i;
  const bestEval = better(evals[bi], state.bestEval) ? evals[bi] : state.bestEval;
  const best = better(evals[bi], state.bestEval) ? next[bi] : state.best;
  return {
    pop: next,
    evals,
    best,
    bestEval,
    gen: state.gen + 1,
    history: [...state.history, bestEval.value].slice(-120),
    rng,
  };
}

export function runOptimizer(state: OptState, ctx: OptCtx, generations: number): OptState {
  let s = state;
  for (let i = 0; i < generations; i++) s = stepOptimizer(s, ctx);
  return s;
}

/* ---------------------------------------------------------------- audyt planu */

/**
 * "rule" to zasada, której optymalizator nigdy nie złamie — naprawa jej pilnuje.
 * "outcome" to skutek, który z planu wychodzi i który trzeba zobaczyć, ale
 * którego sama naprawa nie usunie (limit łańcucha, tygodnie na minusie).
 */
export type Check = { rule: string; ok: boolean; detail: string; kind: "rule" | "outcome" };

/** Lista kontrolna: co plan musiał spełnić, żeby w ogóle wyjść z optymalizatora. */
export function auditPlan(plan: Plan, lines: Line[], g: Guards, p: SimParams, ev: Eval): Check[] {
  const ids = idsOf(lines);
  const name = (id: LineId) => LINES.find((l) => l.id === id)?.name ?? id;
  const checks: Check[] = [];

  const bursts: string[] = [];
  let burstOk = true;
  for (const id of ids) {
    let streak = 0;
    let max = 0;
    for (let w = 0; w < WEEKS; w++) {
      streak = isOn(plan[w][id]) ? streak + 1 : 0;
      max = Math.max(max, streak);
    }
    if (max > 0) bursts.push(`${name(id)} ${max}`);
    if (max > g.maxBurst) burstOk = false;
  }
  checks.push({
    rule: `Fala nie dłuższa niż ${g.maxBurst} tyg.`,
    kind: "rule",
    ok: burstOk,
    detail: bursts.length ? `najdłuższe fale: ${bursts.join(", ")}` : "żadna linia nie wchodzi do gazetki",
  });

  let pairOk = true;
  const clashes: string[] = [];
  for (const [a, b] of g.forbidPairs) {
    for (let w = 0; w < WEEKS; w++) {
      if (isOn(plan[w][a] ?? "none") && isOn(plan[w][b] ?? "none")) {
        pairOk = false;
        clashes.push(`tydz. ${w + 1}`);
      }
    }
  }
  checks.push({
    rule: g.forbidPairs.map(([a, b]) => `${name(a)} i ${name(b)} osobno`).join("; ") || "brak par zakazanych",
    kind: "rule",
    ok: pairOk,
    detail: pairOk ? "nigdy nie stoją w tym samym tygodniu" : `kolizje: ${clashes.join(", ")}`,
  });

  const weekCounts = plan.map((w) => ids.filter((id) => isOn(w[id])).length);
  checks.push({
    rule: `Najwyżej ${g.maxLinesPerWeek} linie naraz`,
    kind: "rule",
    ok: Math.max(0, ...weekCounts) <= g.maxLinesPerWeek,
    detail: `maksimum w planie: ${Math.max(0, ...weekCounts)}`,
  });

  const silent = weekCounts.filter((c) => c === 0).length;
  checks.push({
    rule: `Co najmniej ${g.minSilentWeeks} tyg. bez gazetki`,
    kind: "rule",
    ok: silent >= g.minSilentWeeks,
    detail: `${silent} tyg. ciszy`,
  });

  const budgets = ids.map((id) => {
    const n = plan.filter((w) => isOn(w[id])).length;
    return { id, n, ok: n <= g.maxPromoWeeks[id] };
  });
  checks.push({
    rule: "Budżet tygodni promocyjnych na linię",
    kind: "rule",
    ok: budgets.every((b) => b.ok),
    detail: budgets.map((b) => `${name(b.id)} ${b.n}/${g.maxPromoWeeks[b.id]}`).join(", "),
  });

  if (g.ladder !== "off") {
    const anchors = lines.filter((l) => g.anchor[l.id]);
    let ok = true;
    const worst: string[] = [];
    for (const a of anchors) {
      const floor = ladderFloor(a, lines, g);
      let low = Infinity;
      for (let w = 0; w < WEEKS; w++) low = Math.min(low, effectiveZlPerLiter(a, MECH_BY_ID[plan[w][a.id]]));
      if (low < floor - 1e-9) ok = false;
      worst.push(`${a.name} min ${low.toFixed(2)} zł/L ≥ ${floor.toFixed(2)}`);
    }
    checks.push({
      rule: g.ladder === "strict" ? "Premium nie wchodzi w średnią półkę" : "Premium nie schodzi pod najtańszą linię",
      kind: "rule",
      ok,
      detail: worst.join("; ") || "brak linii-kotwicy",
    });
  }

  const cappedWeeks = ev.rows.filter((r) => r.capped).map((r) => r.week);
  checks.push({
    rule: `Limit łańcucha ${p.cap} ${p.capMode === "liters" ? "L" : "kart."} / tydz.`,
    kind: "outcome",
    ok: cappedWeeks.length === 0,
    detail: cappedWeeks.length
      ? `przycięte tygodnie: ${cappedWeeks.join(", ")} — łańcuch tyle nie przyjmie, sprzedaż wyparuje`
      : "żaden tydzień nie uderza w sufit",
  });

  const negative = ev.rows.filter((r) => r.margin < 0).map((r) => r.week);
  checks.push({
    rule: "Żaden tydzień nie schodzi pod zero",
    kind: "outcome",
    ok: negative.length === 0,
    detail: negative.length ? `stratne tygodnie: ${negative.join(", ")}` : `najsłabszy tydzień: ${Math.round(ev.worstWeek)} zł`,
  });

  return checks;
}
