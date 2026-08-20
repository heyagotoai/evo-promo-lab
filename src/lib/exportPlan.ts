import {
  CARTON,
  MECH_BY_ID,
  effectiveZlPerLiter,
  onLabel,
  zlL,
  type Line,
  type SimParams,
  type Totals,
  type WeekRow,
} from "./lines";
import type { Check, Goal, Objective, Plan } from "./optimize";
import type { Reading } from "./advisor";
import type { Stress } from "./robust";

/**
 * Plan, który zostaje w przeglądarce, nie trafia do gazetki. Raport jest tak
 * zbudowany, żeby wkleić go wprost do arkusza albo do prezentacji — razem
 * z parametrami, ich źródłem i dowodem, że reguły są spełnione.
 */

export type Row = string[];

const SEP = ";";
/** Polski Excel domyślnie dzieli po średniku i oczekuje przecinka dziesiętnego. */
export function plNum(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(decimals).replace(".", ",");
}

export function csvCell(value: string): string {
  if (/[";\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCSV(rows: Row[]): string {
  return rows.map((r) => r.map(csvCell).join(SEP)).join("\r\n");
}

export function tsvCell(value: string): string {
  // Arkusze dzielą wklejany tekst po tabulatorach i nowych liniach — usuwamy je z komórek.
  return value.replace(/[\t\r\n]+/g, " ");
}

export function toTSV(rows: Row[]): string {
  return rows.map((r) => r.map(tsvCell).join("\t")).join("\n");
}

export function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fileStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

const OBJECTIVE_LABEL: Record<Objective, string> = {
  margin: "Marża 12 tyg.",
  liters: "Litry 12 tyg.",
  revenue: "Obrót 12 tyg.",
};

const EVIDENCE_LABEL: Record<Reading["evidence"], string> = {
  measured: "zmierzone",
  declared: "zadeklarowane",
  default: "DOMYŚLNE",
};

export type ReportInput = {
  now: Date;
  plan: Plan;
  rows: WeekRow[];
  tot: Totals;
  lines: Line[];
  params: SimParams;
  goal: Goal;
  seed: number;
  generations: number;
  baselineLabel: string;
  baselineTot: Totals;
  checks: Check[];
  readings: Reading[] | null;
  confidence: { measured: number; total: number; level: string } | null;
  stress: Stress | null;
};

/** Cały raport jako tablica wierszy — jedno źródło i dla CSV, i dla schowka. */
export function planReport(i: ReportInput): Row[] {
  const rows: Row[] = [];
  const blank = () => rows.push([]);
  const head = (t: string) => rows.push([t]);

  head("PLAN PROMOCJI — 12 TYGODNI");
  rows.push(["Wygenerowano", stamp(i.now)]);
  rows.push(["Cel", OBJECTIVE_LABEL[i.goal.objective]]);
  if (i.goal.minLiters > 0) rows.push(["Próg wolumenu", `${plNum(i.goal.minLiters)} L`]);
  if (i.goal.minMargin > 0) rows.push(["Próg marży", `${plNum(i.goal.minMargin)} zł`]);
  if (i.goal.noCapOverflow) rows.push(["Próg", "żaden tydzień nie przebija limitu łańcucha"]);
  rows.push(["Punkt odniesienia", i.baselineLabel]);
  rows.push(["Ziarno losowe", String(i.seed)]);
  rows.push(["Pokoleń", String(i.generations)]);
  rows.push([
    "Źródło parametrów",
    i.confidence
      ? `Doradca — ${i.confidence.measured} z ${i.confidence.total} odczytów zmierzonych, pewność ${i.confidence.level}`
      : "wartości modelowe (syntetyczne) — nie pomiary",
  ]);

  blank();
  head("PARAMETRY RYNKU");
  rows.push(["Parametr", "Wartość", "Źródło"]);
  const byKey = new Map((i.readings ?? []).map((r) => [r.key, r]));
  const src = (key: string) => {
    const r = byKey.get(key);
    return r ? EVIDENCE_LABEL[r.evidence] : "DOMYŚLNE";
  };
  rows.push(["Sezon", `×${plNum(i.params.season, 2)}`, src("season")]);
  rows.push(["Kanibalizacja", plNum(i.params.cannibal, 3), src("cannibal")]);
  rows.push(["Zmęczenie fali", plNum(i.params.fatigue, 3), src("fatigue")]);
  rows.push(["Dołek po promo", plNum(i.params.pantry, 3), src("pantry")]);
  rows.push([
    "Limit łańcucha",
    `${plNum(i.params.cap)} ${i.params.capMode === "liters" ? "L" : "kart."} / tydz.`,
    src("cap"),
  ]);
  for (const l of i.lines) {
    rows.push([`${l.name} — elastyczność`, plNum(l.elasticity, 2), src(`elast-${l.id}`)]);
  }

  blank();
  head("CENNIK");
  rows.push(["Linia", "Cena regularna (zł)", "Wytworzenie (zł)", "Opakowanie (L)", "Karton (szt.)", "zł/L"]);
  for (const l of i.lines) {
    rows.push([
      l.name,
      plNum(l.price, 2),
      plNum(l.cogs, 2),
      plNum(l.packL, 2),
      String(CARTON[l.id]),
      plNum(zlL(l), 2),
    ]);
  }

  blank();
  head("KALENDARZ");
  rows.push(["Tydzień", "W gazetce", "Mechanika", "Marża (zł)", "Obrót (zł)", "Litry", "Kartony", "Limit"]);
  i.rows.forEach((r, w) => {
    const mech = i.lines
      .filter((l) => MECH_BY_ID[i.plan[w][l.id]].kind !== "off")
      .map((l) => `${l.name} ${MECH_BY_ID[i.plan[w][l.id]].label}`)
      .join(" + ");
    rows.push([
      String(r.week),
      onLabel(r.on),
      mech || "—",
      plNum(r.margin),
      plNum(r.revenue),
      plNum(r.liters),
      plNum(r.cartons),
      r.capped ? "PRZYCIĘTY" : "",
    ]);
  });

  blank();
  head("EFEKTYWNA CENA ZA LITR");
  rows.push(["Linia", "Regularnie (zł/L)", "Najgłębiej w planie (zł/L)", "Mechanika", "Tygodni w gazetce"]);
  for (const l of i.lines) {
    const used = i.plan.map((w) => w[l.id]);
    const deepest = used.reduce((a, b) => (MECH_BY_ID[b].depth > MECH_BY_ID[a].depth ? b : a), "none" as const);
    rows.push([
      l.name,
      plNum(zlL(l), 2),
      plNum(effectiveZlPerLiter(l, MECH_BY_ID[deepest]), 2),
      MECH_BY_ID[deepest].label,
      String(used.filter((m) => MECH_BY_ID[m].kind !== "off").length),
    ]);
  }

  blank();
  head("PODSUMOWANIE");
  rows.push(["Pozycja", "Plan", i.baselineLabel, "Różnica"]);
  const cmp = (label: string, a: number, b: number, d = 0) =>
    rows.push([label, plNum(a, d), plNum(b, d), plNum(a - b, d)]);
  cmp("Marża 12 tyg. (zł)", i.tot.margin, i.baselineTot.margin);
  cmp("Obrót 12 tyg. (zł)", i.tot.revenue, i.baselineTot.revenue);
  cmp("Litry 12 tyg.", i.tot.liters, i.baselineTot.liters);
  cmp("Kartony 12 tyg.", i.tot.cartons, i.baselineTot.cartons);
  cmp("Euforia w cenie regularnej (szt.)", i.tot.fullPriceEuforia, i.baselineTot.fullPriceEuforia);

  blank();
  head("REGUŁY I SKUTKI");
  rows.push(["Pozycja", "Rodzaj", "Wynik", "Dowód"]);
  for (const c of i.checks) {
    rows.push([
      c.rule,
      c.kind === "rule" ? "reguła" : "skutek",
      c.ok ? (c.kind === "rule" ? "spełniona" : "czysto") : c.kind === "rule" ? "ZŁAMANA" : "uwaga",
      c.detail,
    ]);
  }

  if (i.stress) {
    blank();
    head("ODPORNOŚĆ NA NIEPEWNOŚĆ PARAMETRÓW");
    rows.push(["Scenariuszy", String(i.stress.n)]);
    rows.push(["Plan bije dzisiejszy w", `${plNum(i.stress.winRate * 100, 1)}% scenariuszy`]);
    rows.push(["Brief spełniony w", `${plNum(i.stress.feasibleRate * 100, 1)}% scenariuszy`]);
    rows.push(["Brief spełniony przez dzisiejszy plan w", `${plNum(i.stress.refFeasibleRate * 100, 1)}% scenariuszy`]);
    rows.push(["Przewaga — mediana (zł)", plNum(i.stress.medianDelta)]);
    rows.push(["Przewaga — 5. percentyl (zł)", plNum(i.stress.p05Delta)]);
    rows.push(["Przewaga — najgorszy przypadek (zł)", plNum(i.stress.worstDelta)]);
    blank();
    rows.push(["Parametr", "Pasmo niepewności", "Źródło", "Wpływ na przewagę (zł)"]);
    for (const s of i.stress.sensitivity) {
      rows.push([s.label, `±${plNum(s.band * 100, 0)}%`, EVIDENCE_LABEL[s.evidence], plNum(s.swing)]);
    }
  }

  blank();
  rows.push([
    "Uwaga",
    "Model nie zna listingu, ekspozycji, akcji konkurencji ani dopłat sieci do gazetki. Parametry oznaczone DOMYŚLNE nie są pomiarem.",
  ]);
  return rows;
}

export function reportFilename(now: Date): string {
  return `plan-promo-${fileStamp(now)}.csv`;
}

/** BOM, żeby Excel nie zjadł polskich znaków. */
export const BOM = "﻿";

export function downloadCSV(rows: Row[], filename: string): void {
  const blob = new Blob([BOM + toCSV(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function copyTSV(rows: Row[]): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(toTSV(rows));
    return true;
  } catch {
    return false;
  }
}
