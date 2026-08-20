import { useMemo, useState } from "react";
import { Button, Callout, LineChart, Stat, Table, chartBlue } from "../ui";

type Stop = { id: number; name: string; short: string; x: number; y: number };
const STOPS: Stop[] = [
  { id: 0, name: "Biuro", short: "Biuro", x: 40, y: 140 },
  { id: 1, name: "Klient Helios", short: "Helios", x: 183, y: 207 },
  { id: 2, name: "Klient Nimbus", short: "Nimbus", x: 113, y: 115 },
  { id: 3, name: "Klient Nord", short: "Nord", x: 67, y: 64 },
  { id: 4, name: "Urząd skarbowy", short: "Urząd", x: 110, y: 182 },
  { id: 5, name: "Magazyn", short: "Magazyn", x: 227, y: 45 },
  { id: 6, name: "Serwis IT", short: "Serwis", x: 63, y: 57 },
  { id: 7, name: "Klient Vega", short: "Vega", x: 353, y: 242 },
];
const IDS = [1, 2, 3, 4, 5, 6, 7];
const SCALE = 0.25;
const N = 28;

const DIST = STOPS.map((a) =>
  STOPS.map((b) => (a.id === b.id ? 0 : Math.hypot(a.x - b.x, a.y - b.y) * SCALE)),
);

function tour(order: number[]) {
  let d = 0;
  let prev = 0;
  for (const x of order) {
    d += DIST[prev][x];
    prev = x;
  }
  return d + DIST[prev][0];
}
function shuffle(ids: number[]) {
  const a = ids.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function greedy() {
  const left = new Set(IDS);
  const order: number[] = [];
  let cur = 0;
  while (left.size) {
    let best = -1;
    let bestD = Infinity;
    left.forEach((j) => {
      if (DIST[cur][j] < bestD) {
        bestD = DIST[cur][j];
        best = j;
      }
    });
    order.push(best);
    left.delete(best);
    cur = best;
  }
  return order;
}
function brute() {
  let bestO = IDS.slice();
  let best = Infinity;
  const walk = (rem: number[], acc: number[]) => {
    if (!rem.length) {
      const m = tour(acc);
      if (m < best) {
        best = m;
        bestO = acc.slice();
      }
      return;
    }
    for (let i = 0; i < rem.length; i++) {
      acc.push(rem[i]);
      walk(rem.slice(0, i).concat(rem.slice(i + 1)), acc);
      acc.pop();
    }
  };
  walk(IDS, []);
  return { order: bestO, minutes: best };
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
function bestOf(pop: number[][]) {
  return pop.reduce((b, x) => (tour(x) < tour(b) ? x : b));
}
function step(pop: number[][]) {
  const ranked = [...pop].sort((a, b) => tour(a) - tour(b));
  const next = [ranked[0].slice(), ranked[1].slice()];
  while (next.length < N) {
    const p1 = pop[Math.floor(Math.random() * N)];
    const p2 = pop[Math.floor(Math.random() * N)];
    let c = ox(tour(p1) < tour(p2) ? p1 : p2, tour(p1) < tour(p2) ? p2 : p1);
    if (Math.random() < 0.4) {
      const i = Math.floor(Math.random() * c.length);
      let j = Math.floor(Math.random() * c.length);
      if (j === i) j = (j + 1) % c.length;
      [c[i], c[j]] = [c[j], c[i]];
    }
    next.push(c);
  }
  return next;
}

const GREEDY = greedy();
const GREEDY_MIN = tour(GREEDY);
const OPT = brute();

export function WorkdayPage() {
  const [pop, setPop] = useState(() => Array.from({ length: N }, () => shuffle(IDS)));
  const [gen, setGen] = useState(0);
  const [hist, setHist] = useState(() => [tour(bestOf(Array.from({ length: N }, () => shuffle(IDS))))]);

  const best = bestOf(pop);
  const bestMin = tour(best);
  const hit = bestMin - OPT.minutes < 0.05;

  const reset = () => {
    const p = Array.from({ length: N }, () => shuffle(IDS));
    setPop(p);
    setGen(0);
    setHist([tour(bestOf(p))]);
  };
  const run = (k: number) => {
    let p = pop;
    let g = gen;
    const h = [...hist];
    for (let i = 0; i < k; i++) {
      p = step(p);
      g += 1;
      h.push(tour(bestOf(p)));
      if (tour(bestOf(p)) - OPT.minutes < 0.05) break;
    }
    setPop(p);
    setGen(g);
    setHist(h.slice(-80));
  };

  const seq = [0, ...best, 0];
  const path = seq.map((id) => `${STOPS[id].x},${STOPS[id].y}`).join(" ");
  const gPath = [0, ...GREEDY, 0].map((id) => `${STOPS[id].x},${STOPS[id].y}`).join(" ");
  const legs = useMemo(() => {
    const s = [0, ...best, 0];
    return s.slice(0, -1).map((from, i) => ({
      n: i + 1,
      a: STOPS[from].name,
      b: STOPS[s[i + 1]].name,
      m: DIST[from][s[i + 1]],
    }));
  }, [best]);

  return (
    <div className="stack">
      <div>
        <h1>Dzień w terenie — kolejność 7 wizyt</h1>
        <p className="muted">
          Genom = permutacja. Fitness = minuty przejazdu. Zachłanny „najbliższy punkt” zostawia przekątne.
        </p>
      </div>
      {hit ? (
        <Callout tone="ok" title="Optimum">
          {OPT.minutes.toFixed(0)} min. Przy 7 wizytach 7! = 5040 da się sprawdzić.
        </Callout>
      ) : (
        <Callout tone="info" title="Pułapka najbliższego">
          Zachłanny: {GREEDY_MIN.toFixed(0)} min. Optimum: {OPT.minutes.toFixed(0)} min. Różnica to
          Serwis→Vega i Vega→Biuro.
        </Callout>
      )}
      <div className="row">
        <Stat value={`${bestMin.toFixed(0)} min`} label="Najlepsza EA" tone={hit ? "ok" : undefined} />
        <Stat value={`${GREEDY_MIN.toFixed(0)} min`} label="Zachłanny" />
        <Stat value={`${OPT.minutes.toFixed(0)} min`} label="Optimum" tone="ok" />
        <Stat value={String(gen)} label="Pokolenie" />
      </div>
      <div className="row">
        <Button onClick={() => run(1)}>+1 pokolenie</Button>
        <Button variant="primary" onClick={() => run(30)}>
          +30 pokoleń
        </Button>
        <Button onClick={reset}>Przywróć start</Button>
      </div>
      <div className="grid grid-2">
        <div>
          <h2>Mapa (ciągła = EA, kreska = zachłanny)</h2>
          <svg viewBox="0 0 400 280" className="map">
            <polyline points={gPath} fill="none" stroke="#666" strokeWidth={2} strokeDasharray="6 4" />
            <polyline points={path} fill="none" stroke="#3b82f6" strokeWidth={2} />
            {STOPS.map((s) => (
              <g key={s.id}>
                <circle cx={s.x} cy={s.y} r={s.id === 0 ? 7 : 5} fill={s.id === 0 ? "#3b82f6" : "#444"} stroke="#888" />
                <text x={s.x + 8} y={s.y - 6} fill="#cfcfcf" fontSize={10}>
                  {s.short}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <div>
          <h2>Czas w pokoleniach</h2>
          <LineChart
            categories={hist.map((_, i) => String(i))}
            series={[{ name: "Czas", data: hist.map((x) => Number(x.toFixed(1))), color: chartBlue }]}
            suffix=" min"
            reference={{ value: Number(OPT.minutes.toFixed(1)), label: "optimum" }}
          />
        </div>
      </div>
      <h2>Odcinki</h2>
      <Table
        headers={["#", "Skąd", "Dokąd", "Czas"]}
        align={["l", "l", "l", "r"]}
        rows={legs.map((l) => [String(l.n), l.a, l.b, `${l.m.toFixed(0)} min`])}
      />
    </div>
  );
}
