import { useState } from "react";
import { Button, Callout, LineChart, Stat, Table, chartGreen, pln } from "../ui";

type Shop = { id: number; name: string; short: string; x: number; y: number; value: number; dwell: number };
const SHOPS: Shop[] = [
  { id: 0, name: "Hurtownia", short: "Hurt", x: 48, y: 140, value: 0, dwell: 0 },
  { id: 1, name: "Sklep U Basi", short: "U Basi", x: 72, y: 118, value: 800, dwell: 18 },
  { id: 2, name: "Żabka centrum", short: "Żabka", x: 88, y: 158, value: 1100, dwell: 20 },
  { id: 3, name: "Kawiarnia Lody", short: "Kawiarnia", x: 82, y: 92, value: 1400, dwell: 22 },
  { id: 4, name: "Stacja BP", short: "BP", x: 118, y: 172, value: 1700, dwell: 18 },
  { id: 5, name: "Biedronka", short: "Biedronka", x: 128, y: 128, value: 2600, dwell: 32 },
  { id: 6, name: "Lidl", short: "Lidl", x: 155, y: 86, value: 3900, dwell: 38 },
  { id: 7, name: "Restauracja Marina", short: "Marina", x: 198, y: 228, value: 2400, dwell: 28 },
  { id: 8, name: "Plaża Molo", short: "Molo", x: 338, y: 42, value: 8200, dwell: 40 },
  { id: 9, name: "Hotel Baltic", short: "Hotel", x: 352, y: 78, value: 6100, dwell: 35 },
  { id: 10, name: "Camping", short: "Camping", x: 312, y: 96, value: 4700, dwell: 28 },
  { id: 11, name: "Festiwal Smaków", short: "Festiwal", x: 92, y: 252, value: 9800, dwell: 70 },
];
const IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const SCALE = 0.28;
const BUDGET = 360;
const N = 32;
const DIST = SHOPS.map((a) => SHOPS.map((b) => Math.hypot(a.x - b.x, a.y - b.y) * SCALE));

type Plan = { value: number; minutes: number; visited: number[] };

function decode(order: number[]): Plan {
  let t = 0;
  let value = 0;
  const visited: number[] = [];
  let cur = 0;
  for (const s of order) {
    const travel = DIST[cur][s];
    if (t + travel + SHOPS[s].dwell + DIST[s][0] <= BUDGET) {
      t += travel + SHOPS[s].dwell;
      value += SHOPS[s].value;
      visited.push(s);
      cur = s;
    }
  }
  return { value, minutes: t + DIST[cur][0], visited };
}
function shuffle(ids: number[]) {
  const a = ids.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function greedy(key: "near" | "val"): Plan {
  const left = new Set(IDS);
  let t = 0;
  let value = 0;
  const visited: number[] = [];
  let cur = 0;
  while (true) {
    const cand: { s: number; score: number }[] = [];
    left.forEach((s) => {
      const extra = DIST[cur][s] + SHOPS[s].dwell;
      if (t + extra + DIST[s][0] <= BUDGET && extra > 0) {
        cand.push({ s, score: key === "near" ? DIST[cur][s] : -SHOPS[s].value });
      }
    });
    if (!cand.length) break;
    cand.sort((a, b) => a.score - b.score);
    const s = cand[0].s;
    t += DIST[cur][s] + SHOPS[s].dwell;
    value += SHOPS[s].value;
    visited.push(s);
    left.delete(s);
    cur = s;
  }
  return { value, minutes: t + DIST[cur][0], visited };
}
function ox(a: number[], b: number[]) {
  const n = a.length;
  let i = Math.floor(Math.random() * n);
  let j = Math.floor(Math.random() * n);
  if (i > j) [i, j] = [j, i];
  const child = Array(n).fill(-1);
  const taken = new Set<number>();
  for (let k = i; k <= j; k++) {
    child[k] = a[k];
    taken.add(a[k]);
  }
  let pos = (j + 1) % n;
  for (let k = 0; k < n; k++) {
    const gene = b[(j + 1 + k) % n];
    if (!taken.has(gene)) {
      child[pos] = gene;
      pos = (pos + 1) % n;
    }
  }
  return child;
}
function bestCh(pop: number[][]) {
  return pop.reduce((b, x) => (decode(x).value > decode(b).value ? x : b));
}

const NEAR = greedy("near");
const VALUE = greedy("val");

export function IceSalesPage() {
  const [pop, setPop] = useState(() => Array.from({ length: N }, () => shuffle(IDS)));
  const [gen, setGen] = useState(0);
  const [hist, setHist] = useState(() => [decode(bestCh(Array.from({ length: N }, () => shuffle(IDS)))).value]);

  const chrom = bestCh(pop);
  const plan = decode(chrom);
  const skipped = IDS.filter((id) => !plan.visited.includes(id));
  const beats = plan.value > VALUE.value;

  const reset = () => {
    const p = Array.from({ length: N }, () => shuffle(IDS));
    setPop(p);
    setGen(0);
    setHist([decode(bestCh(p)).value]);
  };
  const run = (k: number) => {
    let p = pop;
    let g = gen;
    const h = [...hist];
    for (let i = 0; i < k; i++) {
      const ranked = [...p].sort((a, b) => decode(b).value - decode(a).value);
      const next = [ranked[0].slice(), ranked[1].slice()];
      while (next.length < N) {
        let c = ox(ranked[Math.floor(Math.random() * 8)] ?? ranked[0], ranked[Math.floor(Math.random() * 8)] ?? ranked[1]);
        if (Math.random() < 0.45) {
          const i1 = Math.floor(Math.random() * c.length);
          let j = Math.floor(Math.random() * c.length);
          if (j === i1) j = (j + 1) % c.length;
          [c[i1], c[j]] = [c[j], c[i1]];
        }
        next.push(c);
      }
      p = next;
      g += 1;
      h.push(decode(bestCh(p)).value);
    }
    setPop(p);
    setGen(g);
    setHist(h.slice(-80));
  };

  const path = [0, ...plan.visited, 0].map((id) => `${SHOPS[id].x},${SHOPS[id].y}`).join(" ");
  const chosen = new Set(plan.visited);

  return (
    <div className="stack">
      <div>
        <h1>Przedstawiciel lodów — kogo dziś odwiedzić</h1>
        <p className="muted">
          6 godzin, 11 punktów, nie da się wszędzie. Genom = priorytety. Fitness = zł zamówień, nie kilometry.
        </p>
      </div>
      {beats ? (
        <Callout tone="ok" title="Festiwal jest pułapką">
          Największy kontrakt to {pln(9800)}, ale zjada 70 min. Zachłanny jackpot: {pln(VALUE.value)}. Plan EA:{" "}
          {pln(plan.value)}.
        </Callout>
      ) : (
        <Callout tone="info" title="Wolno pomijać">
          Żabka obok hurtowni jest wygodna i słaba, gdy nad morzem stoją palety po {pln(8200)}.
        </Callout>
      )}
      <div className="row">
        <Stat value={pln(plan.value)} label="Plan EA" tone={beats ? "ok" : undefined} />
        <Stat value={pln(VALUE.value)} label="Zachłanny: największy kontrakt" />
        <Stat value={pln(NEAR.value)} label="Zachłanny: najbliższy" />
        <Stat value={`${plan.visited.length} / ${IDS.length}`} label="Wizyty" />
      </div>
      <div className="row">
        <Button onClick={() => run(1)}>+1 pokolenie</Button>
        <Button variant="primary" onClick={() => run(40)}>
          +40 pokoleń
        </Button>
        <Button onClick={reset}>Przywróć start</Button>
        <span className="small">
          Pokolenie {gen} · {plan.minutes.toFixed(0)}/{BUDGET} min
        </span>
      </div>
      <h2>Mapa dnia</h2>
      <svg viewBox="0 0 400 280" className="map">
        <polyline points={path} fill="none" stroke="#3b82f6" strokeWidth={2} />
        {SHOPS.map((s) => {
          const on = s.id === 0 || chosen.has(s.id);
          const r = s.id === 0 ? 7 : Math.max(4, 3 + s.value / 1800);
          return (
            <g key={s.id} opacity={on ? 1 : 0.4}>
              <circle cx={s.x} cy={s.y} r={r} fill={s.id === 0 ? "#3b82f6" : "#555"} stroke={on ? "#3b82f6" : "#444"} />
              <text x={s.x + 8} y={s.y - 6} fill="#cfcfcf" fontSize={10}>
                {s.short}
              </text>
            </g>
          );
        })}
      </svg>
      <h2>Suma zamówień w pokoleniach</h2>
      <LineChart
        categories={hist.map((_, i) => String(i))}
        series={[{ name: "zł", data: hist, color: chartGreen }]}
        suffix=" zł"
        reference={{ value: VALUE.value, label: "jackpot" }}
      />
      <h2>Plan dnia</h2>
      <Table
        headers={["#", "Punkt", "Zamówienie"]}
        align={["l", "l", "r"]}
        rows={plan.visited.map((id, i) => [String(i + 1), SHOPS[id].name, pln(SHOPS[id].value)])}
      />
      <h2>Pominięte</h2>
      <Table
        headers={["Punkt", "Ile kusi", "Dlaczego"]}
        align={["l", "r", "l"]}
        tones={skipped.map((id) => (id === 11 ? "warn" : "neutral"))}
        rows={skipped.map((id) => [
          SHOPS[id].name,
          pln(SHOPS[id].value),
          id === 11 ? "Jackpot, ale 70 min + zjazd na południe." : "Nie mieści się w korytarzu / za mały rachunek.",
        ])}
      />
    </div>
  );
}
