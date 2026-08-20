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

export type Mechs = Record<LineId, MechId>;

export type WeekRow = {
  week: number;
  on: LineId[];
  revenue: number;
  margin: number;
  liters: number;
  packs: Record<LineId, number>;
  fullPriceEuforia: number;
};

export type SimParams = {
  season: number;
  cannibal: number;
  fatigue: number;
  pantry: number;
  cogsScale: number;
  elastScale: number;
  literCap: number;
};

function neighbors(id: LineId): LineId[] {
  if (id === "euforia") return ["retro"];
  if (id === "retro") return ["euforia", "pycha"];
  if (id === "pycha") return ["retro", "flirt"];
  return ["pycha", "retro"];
}

export function buildCalendar(strategy: string, burst: number): LineId[][] {
  const weeks: LineId[][] = Array.from({ length: 12 }, () => []);
  const put = (start: number, len: number, ids: LineId[]) => {
    for (let i = 0; i < len; i++) {
      const w = start + i;
      if (w >= 0 && w < 12) weeks[w] = ids.slice();
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
    for (let w = 0; w < 12; w++) weeks[w] = LINE_IDS.slice();
  } else if (strategy === "alwaysFlirt") {
    for (let w = 0; w < 12; w++) weeks[w] = ["flirt"];
  }
  return weeks;
}

export function simulate(calendar: LineId[][], mechs: Mechs, p: SimParams): WeekRow[] {
  const streak: Record<LineId, number> = { euforia: 0, retro: 0, pycha: 0, flirt: 0 };
  const offStreak: Record<LineId, number> = { euforia: 0, retro: 0, pycha: 0, flirt: 0 };
  const rows: WeekRow[] = [];

  for (let w = 0; w < 12; w++) {
    const on = calendar[w] ?? [];
    const paid: Record<LineId, number> = { euforia: 0, retro: 0, pycha: 0, flirt: 0 };
    const out: Record<LineId, number> = { euforia: 0, retro: 0, pycha: 0, flirt: 0 };

    for (const line of LINES) {
      const mech = MECH_BY_ID[mechs[line.id]];
      const active = on.includes(line.id) && mech.kind !== "off";
      if (active) {
        streak[line.id] += 1;
        offStreak[line.id] = 0;
      } else {
        streak[line.id] = 0;
        offStreak[line.id] += 1;
      }
      const fatigueMul = active ? Math.max(0.35, 1 - p.fatigue * (streak[line.id] - 1)) : 1;
      const pantryMul =
        !active && offStreak[line.id] <= 2
          ? 1 - p.pantry * (MECH_BY_ID[mechs[line.id]].kind === "gratis" ? 1.35 : 1)
          : 1;
      const lift = active
        ? line.elasticity * p.elastScale * mech.depth * fatigueMul * (mech.minPaid > 1 ? 0.88 : 1)
        : 0;
      const packs = line.basePacks * p.season * pantryMul * (1 + lift);
      paid[line.id] = packs;
      out[line.id] = packs * (active ? mech.unitMult : 1);
    }

    for (const line of LINES) {
      const mech = MECH_BY_ID[mechs[line.id]];
      if (!(on.includes(line.id) && mech.kind !== "off")) continue;
      const extra = Math.max(0, paid[line.id] - line.basePacks * p.season);
      const steal = extra * p.cannibal;
      const nb = neighbors(line.id);
      const share = steal / nb.length;
      for (const n of nb) {
        const floor = line.basePacks * 0.12;
        const take = Math.min(share, Math.max(0, paid[n] - floor));
        paid[n] -= take;
        const nActive = on.includes(n) && MECH_BY_ID[mechs[n]].kind !== "off";
        out[n] = paid[n] * (nActive ? MECH_BY_ID[mechs[n]].unitMult : 1);
      }
    }

    let revenue = 0;
    let cost = 0;
    let liters = 0;
    for (const line of LINES) {
      const mech = MECH_BY_ID[mechs[line.id]];
      const active = on.includes(line.id) && mech.kind !== "off";
      const packRev = active && mech.kind === "pct" ? line.price * (1 - mech.depth) : line.price;
      revenue += paid[line.id] * packRev;
      cost += out[line.id] * line.cogs * p.cogsScale;
      liters += out[line.id] * line.packL;
    }
    if (liters > p.literCap) {
      const scale = p.literCap / liters;
      revenue *= scale;
      cost *= scale;
      liters = p.literCap;
      for (const id of LINE_IDS) {
        paid[id] *= scale;
        out[id] *= scale;
      }
    }
    const euMech = MECH_BY_ID[mechs.euforia];
    const euOn = on.includes("euforia") && euMech.kind !== "off";
    rows.push({
      week: w + 1,
      on: on.slice(),
      revenue,
      margin: revenue - cost,
      liters,
      packs: out,
      fullPriceEuforia: euOn ? 0 : paid.euforia,
    });
  }
  return rows;
}

export function totals(rows: WeekRow[]) {
  return rows.reduce(
    (a, r) => ({
      revenue: a.revenue + r.revenue,
      margin: a.margin + r.margin,
      liters: a.liters + r.liters,
      fullPriceEuforia: a.fullPriceEuforia + r.fullPriceEuforia,
    }),
    { revenue: 0, margin: 0, liters: 0, fullPriceEuforia: 0 },
  );
}

export function onLabel(on: LineId[]): string {
  if (on.length === 0) return "cisza (cena regularna)";
  return on.map((id) => LINES.find((l) => l.id === id)?.name ?? id).join(" + ");
}

export const PRESETS = [
  { id: "protect", label: "Chroń premium" },
  { id: "sequential", label: "Rotacja 1 po 1" },
  { id: "twoFar", label: "Flirt + Euforia naraz" },
  { id: "twoNear", label: "Retro + Pycha naraz" },
  { id: "alwaysFlirt", label: "Tylko Flirt 12 tyg." },
  { id: "allOn", label: "Wszystkie naraz" },
];
