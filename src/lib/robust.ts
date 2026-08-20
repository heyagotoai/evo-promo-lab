import { makeRng } from "./rng";
import { type Line, type SimParams } from "./lines";
import { evaluate, type Goal, type Objective, type Plan } from "./optimize";
import type { Evidence, Reading } from "./advisor";

/**
 * Plan jest optymalny dla JEDNEGO zestawu parametrów, a część z nich to
 * wartości domyślne. Test odporności pyta o coś innego niż optymalizator:
 * czy przewaga nad dzisiejszym planem przeżywa niepewność tych parametrów.
 *
 * Kluczowa zasada: parametry, których nikt nie zmierzył, zaburzamy szeroko,
 * a zmierzone wąsko. Niepewność danych wchodzi wtedy do wyniku zamiast
 * wisieć w przypisie.
 */

export const BAND_BY_EVIDENCE: Record<Evidence, number> = {
  measured: 0.15,
  declared: 0.1,
  default: 0.4,
};

export type Knob = {
  key: string;
  label: string;
  band: number;
  evidence: Evidence;
};

type Limits = { min: number; max: number };

const LIMITS: Record<string, Limits> = {
  season: { min: 0.2, max: 3 },
  cannibal: { min: 0, max: 1 },
  fatigue: { min: 0, max: 0.5 },
  pantry: { min: 0, max: 0.5 },
};
const ELAST_LIMITS: Limits = { min: 0, max: 8 };

const clamp = (x: number, l: Limits) => Math.min(l.max, Math.max(l.min, x));

export function knobsFor(lines: Line[], readings: Reading[] | null): Knob[] {
  const byKey = new Map((readings ?? []).map((r) => [r.key, r]));
  const ev = (key: string): Evidence => byKey.get(key)?.evidence ?? "default";
  const knob = (key: string, label: string): Knob => {
    const e = ev(key);
    return { key, label, band: BAND_BY_EVIDENCE[e], evidence: e };
  };
  const out: Knob[] = [
    knob("season", "Sezon"),
    knob("cannibal", "Kanibalizacja"),
    knob("fatigue", "Zmęczenie fali"),
    knob("pantry", "Dołek po promo"),
  ];
  for (const l of lines) out.push(knob(`elast-${l.id}`, `${l.name} — elastyczność`));
  return out;
}

export type Factors = Record<string, number>;

export function applyFactors(
  params: SimParams,
  lines: Line[],
  f: Factors,
): { params: SimParams; lines: Line[] } {
  const p: SimParams = {
    ...params,
    season: clamp(params.season * (f.season ?? 1), LIMITS.season),
    cannibal: clamp(params.cannibal * (f.cannibal ?? 1), LIMITS.cannibal),
    fatigue: clamp(params.fatigue * (f.fatigue ?? 1), LIMITS.fatigue),
    pantry: clamp(params.pantry * (f.pantry ?? 1), LIMITS.pantry),
  };
  const l = lines.map((line) => ({
    ...line,
    elasticity: clamp(line.elasticity * (f[`elast-${line.id}`] ?? 1), ELAST_LIMITS),
  }));
  return { params: p, lines: l };
}

/** Równomierne losowanie w paśmie ±band wokół wartości bazowej. */
export function drawFactors(rng: () => number, knobs: Knob[]): Factors {
  const f: Factors = {};
  for (const k of knobs) f[k.key] = 1 + k.band * (2 * rng() - 1);
  return f;
}

export type SensitivityRow = Knob & { low: number; high: number; swing: number };

export type Stress = {
  n: number;
  objective: Objective;
  /** Udział scenariuszy, w których plan wypada lepiej od dzisiejszego. */
  winRate: number;
  /** Udział scenariuszy, w których plan nadal spełnia twarde progi briefu. */
  feasibleRate: number;
  /** To samo dla dzisiejszego planu — bez tego 59% wygląda jak wada planu,
   *  a zwykle znaczy tylko tyle, że w słabszym rynku progu nie dowozi nikt. */
  refFeasibleRate: number;
  baseDelta: number;
  medianDelta: number;
  p05Delta: number;
  worstDelta: number;
  bestDelta: number;
  deltas: number[];
  sensitivity: SensitivityRow[];
};

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[i];
}

export type StressInput = {
  plan: Plan;
  reference: Plan;
  lines: Line[];
  params: SimParams;
  goal: Goal;
  knobs: Knob[];
  n: number;
  seed: number;
};

export function stressTest(i: StressInput): Stress {
  const deltaAt = (f: Factors) => {
    const s = applyFactors(i.params, i.lines, f);
    const a = evaluate(i.plan, s.lines, s.params, i.goal);
    const b = evaluate(i.reference, s.lines, s.params, i.goal);
    return { delta: a.value - b.value, feasible: a.feasible, refFeasible: b.feasible };
  };

  const base = deltaAt({});
  const rng = makeRng(i.seed >>> 0);
  const deltas: number[] = [];
  let wins = 0;
  let feasible = 0;
  let refFeasible = 0;
  for (let s = 0; s < i.n; s++) {
    const r = deltaAt(drawFactors(rng, i.knobs));
    deltas.push(r.delta);
    if (r.delta > 0) wins += 1;
    if (r.feasible) feasible += 1;
    if (r.refFeasible) refFeasible += 1;
  }
  const sorted = [...deltas].sort((a, b) => a - b);

  // Wrażliwość: każdą gałkę osobno na oba krańce pasma, reszta bazowo.
  // Mówi, którego brakującego pomiaru brak boli najbardziej.
  const sensitivity: SensitivityRow[] = i.knobs
    .map((k) => {
      const low = deltaAt({ [k.key]: 1 - k.band }).delta;
      const high = deltaAt({ [k.key]: 1 + k.band }).delta;
      return { ...k, low, high, swing: Math.abs(high - low) };
    })
    .sort((a, b) => b.swing - a.swing);

  return {
    n: i.n,
    objective: i.goal.objective,
    winRate: i.n ? wins / i.n : 0,
    feasibleRate: i.n ? feasible / i.n : 0,
    refFeasibleRate: i.n ? refFeasible / i.n : 0,
    baseDelta: base.delta,
    medianDelta: quantile(sorted, 0.5),
    p05Delta: quantile(sorted, 0.05),
    worstDelta: sorted.length ? sorted[0] : 0,
    bestDelta: sorted.length ? sorted[sorted.length - 1] : 0,
    deltas,
    sensitivity,
  };
}

/** Krótkie zdanie do interfejsu — bez owijania, ale i bez straszenia. */
export function stressVerdict(s: Stress): { tone: "ok" | "warn" | "bad"; text: string } {
  if (s.baseDelta <= 0) {
    return {
      tone: "warn",
      text: "Plan nie bije dzisiejszego nawet przy parametrach bazowych — test odporności nie ma czego bronić.",
    };
  }
  if (s.winRate >= 0.95 && s.p05Delta > 0) {
    return {
      tone: "ok",
      text: `Przewaga trzyma się w ${Math.round(s.winRate * 100)}% scenariuszy, a w najgorszych 5% nadal jest dodatnia. To wynik, który da się obronić przed kupcem.`,
    };
  }
  if (s.winRate >= 0.8) {
    return {
      tone: "warn",
      text: `Przewaga trzyma się w ${Math.round(s.winRate * 100)}% scenariuszy, ale w ogonie potrafi zejść do zera. Zanim pokażesz bezwzględną kwotę, zmierz parametr z góry tabeli wrażliwości.`,
    };
  }
  return {
    tone: "bad",
    text: `Przewaga znika w ${Math.round((1 - s.winRate) * 100)}% scenariuszy. Ten plan wygrywa dzięki założeniom, a nie dzięki układowi tygodni — traktuj go jako hipotezę do sprawdzenia, nie jako rekomendację.`,
  };
}
