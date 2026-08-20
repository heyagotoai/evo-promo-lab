export type LineId = "euforia" | "retro" | "pycha" | "flirt";

export type Line = {
  id: LineId;
  name: string;
  packL: number;
  price: number;
  shelf: string;
  basePacks: number;
  elasticity: number;
  cogs: number;
};

export const WEEKS = 12;

/** Sufit liftu: promocja nie skaluje sprzedaży w nieskończoność. */
export const MAX_LIFT = 2.5;

/** Podłoga sprzedaży linii kanibalizowanej: nie da się zjeść całej sąsiadki. */
export const CANNIBAL_FLOOR = 0.12;

export const CARTON: Record<LineId, number> = {
  euforia: 6,
  retro: 6,
  pycha: 4,
  flirt: 8,
};

export const LINES: Line[] = [
  { id: "euforia", name: "Euforia", packL: 1, price: 20, shelf: "premium, najwyższa półka", basePacks: 700, elasticity: 1.15, cogs: 9 },
  { id: "retro", name: "Retro", packL: 1, price: 17, shelf: "średnia+, jakość blisko Pychy", basePacks: 1300, elasticity: 1.7, cogs: 7.4 },
  { id: "pycha", name: "Pycha", packL: 1.35, price: 22, shelf: "jakość ~ Retro, więcej litrów", basePacks: 1100, elasticity: 1.85, cogs: 10.2 },
  { id: "flirt", name: "Flirt", packL: 1, price: 14, shelf: "budżet", basePacks: 2100, elasticity: 2.35, cogs: 6.6 },
];

export const LINE_IDS = LINES.map((l) => l.id);

export type MechId = "none" | "d10" | "d20" | "d30" | "d40" | "d50" | "g11" | "g21" | "g22";

export type Mech = {
  id: MechId;
  label: string;
  depth: number;
  unitMult: number;
  kind: "off" | "pct" | "gratis";
  minPaid: number;
};

export const MECHS: Mech[] = [
  { id: "none", label: "Cena regularna", depth: 0, unitMult: 1, kind: "off", minPaid: 1 },
  { id: "d10", label: "−10%", depth: 0.1, unitMult: 1, kind: "pct", minPaid: 1 },
  { id: "d20", label: "−20%", depth: 0.2, unitMult: 1, kind: "pct", minPaid: 1 },
  { id: "d30", label: "−30%", depth: 0.3, unitMult: 1, kind: "pct", minPaid: 1 },
  { id: "d40", label: "−40%", depth: 0.4, unitMult: 1, kind: "pct", minPaid: 1 },
  { id: "d50", label: "−50% (max)", depth: 0.5, unitMult: 1, kind: "pct", minPaid: 1 },
  { id: "g11", label: "1+1", depth: 0.5, unitMult: 2, kind: "gratis", minPaid: 1 },
  { id: "g21", label: "2+1", depth: 1 / 3, unitMult: 1.5, kind: "gratis", minPaid: 2 },
  { id: "g22", label: "2+2 (max)", depth: 0.5, unitMult: 2, kind: "gratis", minPaid: 2 },
];

export const MECH_BY_ID = Object.fromEntries(MECHS.map((m) => [m.id, m])) as Record<MechId, Mech>;
export const MECH_OPTIONS = MECHS.map((m) => ({ value: m.id, label: m.label }));

export function zlL(line: Line): number {
  return line.price / line.packL;
}

export function effectiveZlPerLiter(line: Line, mech: Mech): number {
  if (mech.kind === "off") return zlL(line);
  if (mech.kind === "pct") return (line.price * (1 - mech.depth)) / line.packL;
  const paid = mech.minPaid;
  const got = paid * mech.unitMult;
  return (paid * line.price) / (got * line.packL);
}

/**
 * Marża na jednym płatnym opakowaniu w danej mechanice.
 * Gratisy nie dają przychodu, ale kosztują COGS — stąd unitMult przy koszcie.
 */
export function packMargin(line: Line, mech: Mech): number {
  const packRev = mech.kind === "pct" ? line.price * (1 - mech.depth) : line.price;
  return packRev - mech.unitMult * line.cogs;
}

/**
 * Próg opłacalności: jaka musi być elastyczność linii, żeby akcja wyszła
 * dokładnie na zero marży wobec tygodnia bez gazetki. Liczone wprost z ceny,
 * kosztu wytworzenia i mechaniki — bez żadnego założenia o rynku.
 * Infinity = mechanika nie wychodzi na zero przy żadnym wolumenie.
 */
export function breakEvenElasticity(line: Line, mech: Mech): number {
  if (mech.kind === "off") return 0;
  const base = line.price - line.cogs;
  const promo = packMargin(line, mech);
  if (promo <= 0) return Infinity;
  if (base <= 0) return 0;
  const k = mech.depth * (mech.minPaid > 1 ? 0.88 : 1);
  if (k <= 0) return Infinity;
  return (base / promo - 1) / k;
}

/**
 * Ile razy musiałby wzrosnąć wolumen płatnych opakowań, żeby akcja wyszła na zero.
 * Powyżej MAX_LIFT jest to nieosiągalne niezależnie od elastyczności.
 */
export function requiredLift(line: Line, mech: Mech): number {
  if (mech.kind === "off") return 0;
  const base = line.price - line.cogs;
  const promo = packMargin(line, mech);
  if (promo <= 0) return Infinity;
  if (base <= 0) return 0;
  return base / promo - 1;
}

/** Czy próg opłacalności jest w ogóle w zasięgu modelu (sufit liftu). */
export function reachable(line: Line, mech: Mech): boolean {
  return requiredLift(line, mech) <= MAX_LIFT + 1e-9;
}

/** Ile brakuje (lub zostaje) elastyczności wobec progu, przy danej gałce skalującej. */
export function breakEvenGap(line: Line, mech: Mech, elastScale: number): number {
  return line.elasticity * elastScale - breakEvenElasticity(line, mech);
}

export type Mechs = Record<LineId, MechId>;

/** Mechanika globalna (jedna na 12 tygodni) albo osobna dla każdego tygodnia. */
export type MechPlan = Mechs | Mechs[];

export type WeekRow = {
  week: number;
  on: LineId[];
  revenue: number;
  margin: number;
  liters: number;
  cartons: number;
  packs: Record<LineId, number>;
  lineMargin: Record<LineId, number>;
  mechs: Mechs;
  capped: boolean;
  fullPriceEuforia: number;
};

export type CapMode = "liters" | "cartons";

export type SimParams = {
  season: number;
  cannibal: number;
  fatigue: number;
  pantry: number;
  elastScale: number;
  capMode: CapMode;
  cap: number;
};

export function cartonsOf(packs: Record<LineId, number>): number {
  return LINE_IDS.reduce((s, id) => s + packs[id] / CARTON[id], 0);
}

export function applyPrices(
  price: Record<LineId, number>,
  cogs: Record<LineId, number>,
): Line[] {
  return LINES.map((l) => ({ ...l, price: price[l.id], cogs: cogs[l.id] }));
}

export const LITER_CAP_OPTIONS = Array.from({ length: 20 }, (_, i) => {
  const v = String((i + 1) * 1000);
  return { value: v, label: `${i + 1} tys. L` };
});

export const CARTON_CAP_OPTIONS = Array.from({ length: 15 }, (_, i) => {
  const n = (i + 1) * 100;
  return { value: String(n), label: `${n} kartonów` };
});

/**
 * Bliskość półkowa: jak mocno promocja jednej linii podbiera drugą.
 * Graf jest symetryczny — jeśli Flirt kradnie Retro, Retro kradnie Flirtowi tyle samo.
 */
const AFFINITY: { a: LineId; b: LineId; w: number }[] = [
  { a: "retro", b: "pycha", w: 1 },
  { a: "pycha", b: "flirt", w: 0.5 },
  { a: "euforia", b: "retro", w: 0.45 },
  { a: "retro", b: "flirt", w: 0.35 },
  { a: "euforia", b: "pycha", w: 0.3 },
  { a: "euforia", b: "flirt", w: 0.1 },
];

export function affinity(a: LineId, b: LineId): number {
  if (a === b) return 0;
  const e = AFFINITY.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  return e ? e.w : 0;
}

export function filterCalendar(weeks: LineId[][], enabled: Record<LineId, boolean>): LineId[][] {
  return weeks.map((w) => w.filter((id) => enabled[id]));
}

export function buildCalendar(strategy: string, burst: number): LineId[][] {
  const weeks: LineId[][] = Array.from({ length: WEEKS }, () => []);
  const put = (start: number, len: number, ids: LineId[]) => {
    for (let i = 0; i < len; i++) {
      const w = start + i;
      if (w >= 0 && w < WEEKS) weeks[w] = ids.slice();
    }
  };
  const b = burst;
  if (strategy === "protect") {
    put(0, b, ["flirt"]);
    put(b + 1, b, ["pycha"]);
    put(2 * b + 2, b, ["retro"]);
    put(11, 1, ["euforia"]);
  } else if (strategy === "sequential") {
    const order: LineId[] = ["flirt", "pycha", "retro", "euforia"];
    let w = 0;
    for (const id of order) {
      put(w, b, [id]);
      w += b + 1;
    }
  } else if (strategy === "twoFar") {
    put(0, b, ["flirt", "euforia"]);
    put(b + 1, b, ["pycha"]);
    put(2 * b + 2, b, ["retro"]);
  } else if (strategy === "twoNear") {
    put(0, b, ["retro", "pycha"]);
    put(b + 1, b, ["flirt"]);
    put(2 * b + 2, 2, ["euforia"]);
  } else if (strategy === "allOn") {
    for (let w = 0; w < WEEKS; w++) weeks[w] = LINE_IDS.slice();
  } else if (strategy === "alwaysFlirt") {
    for (let w = 0; w < WEEKS; w++) weeks[w] = ["flirt"];
  }
  return weeks;
}

const ZERO: Record<LineId, number> = { euforia: 0, retro: 0, pycha: 0, flirt: 0 };

export function simulate(
  calendar: LineId[][],
  mechPlan: MechPlan,
  p: SimParams,
  lines: Line[] = LINES,
): WeekRow[] {
  const perWeek = Array.isArray(mechPlan);
  const mechsAt = (w: number): Mechs =>
    perWeek ? ((mechPlan as Mechs[])[w] ?? (mechPlan as Mechs[])[0]) : (mechPlan as Mechs);

  const streak: Record<LineId, number> = { ...ZERO };
  const offStreak: Record<LineId, number> = { ...ZERO };
  const promoted: Record<LineId, boolean> = { euforia: false, retro: false, pycha: false, flirt: false };
  const lastMechKind: Record<LineId, Mech["kind"]> = {
    euforia: "off",
    retro: "off",
    pycha: "off",
    flirt: "off",
  };
  const rows: WeekRow[] = [];

  for (let w = 0; w < WEEKS; w++) {
    const on = calendar[w] ?? [];
    const mechs = mechsAt(w);
    const base: Record<LineId, number> = { ...ZERO };
    const paid: Record<LineId, number> = { ...ZERO };
    const out: Record<LineId, number> = { ...ZERO };
    const activeOf: Record<LineId, boolean> = { euforia: false, retro: false, pycha: false, flirt: false };

    for (const line of lines) {
      const mech = MECH_BY_ID[mechs[line.id]];
      const active = on.includes(line.id) && mech.kind !== "off";
      activeOf[line.id] = active;
      if (active) {
        streak[line.id] += 1;
        offStreak[line.id] = 0;
        promoted[line.id] = true;
        lastMechKind[line.id] = mech.kind;
      } else {
        streak[line.id] = 0;
        offStreak[line.id] += 1;
      }

      const fatigueMul = active ? Math.max(0.35, 1 - p.fatigue * (streak[line.id] - 1)) : 1;
      // Dołek spiżarni tylko po realnie zakończonej fali — nie na starcie horyzontu.
      const inDip = !active && promoted[line.id] && offStreak[line.id] <= 2;
      const pantryMul = inDip
        ? 1 - p.pantry * (lastMechKind[line.id] === "gratis" ? 1.35 : 1)
        : 1;
      const rawLift = active
        ? line.elasticity * p.elastScale * mech.depth * fatigueMul * (mech.minPaid > 1 ? 0.88 : 1)
        : 0;
      const lift = Math.min(MAX_LIFT, rawLift);

      base[line.id] = line.basePacks * p.season;
      paid[line.id] = base[line.id] * pantryMul * (1 + lift);
    }

    // Kanibalizacja liczona równolegle, ze stanu sprzed kradzieży,
    // żeby wynik nie zależał od kolejności linii w tablicy.
    const before = { ...paid };
    const loss: Record<LineId, number> = { ...ZERO };
    for (const line of lines) {
      if (!activeOf[line.id]) continue;
      const extra = Math.max(0, before[line.id] - base[line.id]);
      const steal = extra * p.cannibal;
      if (steal <= 0) continue;
      const targets = lines
        .filter((l) => l.id !== line.id)
        .map((l) => ({ id: l.id, w: affinity(line.id, l.id) }))
        .filter((t) => t.w > 0);
      const sum = targets.reduce((s, t) => s + t.w, 0);
      if (sum <= 0) continue;
      for (const t of targets) loss[t.id] += steal * (t.w / sum);
    }
    for (const line of lines) {
      // Podłoga liczona z linii kradzionej, nie z kradnącej.
      const floor = Math.min(before[line.id], base[line.id] * CANNIBAL_FLOOR);
      paid[line.id] = Math.max(floor, before[line.id] - loss[line.id]);
      out[line.id] = paid[line.id] * (activeOf[line.id] ? MECH_BY_ID[mechs[line.id]].unitMult : 1);
    }

    let revenue = 0;
    let cost = 0;
    let liters = 0;
    const lineMargin: Record<LineId, number> = { ...ZERO };
    for (const line of lines) {
      const mech = MECH_BY_ID[mechs[line.id]];
      const active = activeOf[line.id];
      const packRev = active && mech.kind === "pct" ? line.price * (1 - mech.depth) : line.price;
      const rev = paid[line.id] * packRev;
      const c = out[line.id] * line.cogs;
      revenue += rev;
      cost += c;
      liters += out[line.id] * line.packL;
      lineMargin[line.id] = rev - c;
    }
    let cartons = cartonsOf(out);
    const load = p.capMode === "liters" ? liters : cartons;
    const capped = p.cap > 0 && load > p.cap;
    if (capped) {
      const scale = p.cap / load;
      revenue *= scale;
      cost *= scale;
      liters *= scale;
      cartons *= scale;
      for (const id of LINE_IDS) {
        paid[id] *= scale;
        out[id] *= scale;
        lineMargin[id] *= scale;
      }
    }
    rows.push({
      week: w + 1,
      on: on.slice(),
      revenue,
      margin: revenue - cost,
      liters,
      cartons,
      packs: out,
      lineMargin,
      mechs,
      capped,
      fullPriceEuforia: activeOf.euforia ? 0 : paid.euforia,
    });
  }
  return rows;
}

export type Totals = {
  revenue: number;
  margin: number;
  liters: number;
  cartons: number;
  fullPriceEuforia: number;
};

export function totals(rows: WeekRow[]): Totals {
  return rows.reduce(
    (a, r) => ({
      revenue: a.revenue + r.revenue,
      margin: a.margin + r.margin,
      liters: a.liters + r.liters,
      cartons: a.cartons + r.cartons,
      fullPriceEuforia: a.fullPriceEuforia + r.fullPriceEuforia,
    }),
    { revenue: 0, margin: 0, liters: 0, cartons: 0, fullPriceEuforia: 0 },
  );
}

export function onLabel(on: LineId[]): string {
  if (on.length === 0) return "cisza (cena regularna)";
  return on.map((id) => LINES.find((l) => l.id === id)?.name ?? id).join(" + ");
}

export const PRESETS = [
  { id: "protect", label: "Chroń premium", chart: ["Chroń", "premium"] },
  { id: "sequential", label: "Rotacja 1 po 1", chart: ["Rotacja", "1 po 1"] },
  { id: "twoFar", label: "Flirt + Euforia naraz", chart: ["Flirt + Euforia", "naraz"] },
  { id: "twoNear", label: "Retro + Pycha naraz", chart: ["Retro + Pycha", "naraz"] },
  { id: "alwaysFlirt", label: "Tylko Flirt 12 tyg.", chart: ["Tylko Flirt", "12 tyg."] },
  { id: "allOn", label: "Wszystkie naraz", chart: ["Wszystkie", "naraz"] },
];
