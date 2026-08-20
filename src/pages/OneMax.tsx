import { useState } from "react";
import { Button, Callout, Field, LineChart, Select, Stat, Table, chartGreen } from "../ui";

const L = 20;
const MAX = L;

function fit(g: number[]) {
  return g.reduce((a, b) => a + b, 0);
}
function randG(): number[] {
  return Array.from({ length: L }, () => (Math.random() < 0.5 ? 1 : 0));
}
function makePop(n: number) {
  return Array.from({ length: n }, randG);
}
function tournament(pop: number[][], k = 3) {
  let best = pop[Math.floor(Math.random() * pop.length)];
  let bf = fit(best);
  for (let i = 1; i < k; i++) {
    const c = pop[Math.floor(Math.random() * pop.length)];
    const f = fit(c);
    if (f > bf) {
      best = c;
      bf = f;
    }
  }
  return best;
}
function step(pop: number[][], mut: number, xo: boolean) {
  const ranked = [...pop].sort((a, b) => fit(b) - fit(a));
  const next = [ranked[0].slice(), ranked[1].slice()];
  while (next.length < pop.length) {
    const a = tournament(pop);
    const b = tournament(pop);
    const cut = Math.floor(Math.random() * L);
    let child = xo && Math.random() < 0.9 ? a.slice(0, cut).concat(b.slice(cut)) : a.slice();
    child = child.map((bit) => (Math.random() < mut ? 1 - bit : bit));
    next.push(child);
  }
  return next;
}

export function OneMaxPage() {
  const [n, setN] = useState("24");
  const [mut, setMut] = useState("0.05");
  const [xo, setXo] = useState("1");
  const [pop, setPop] = useState(() => makePop(24));
  const [gen, setGen] = useState(0);
  const [hist, setHist] = useState(() => {
    const p = makePop(24);
    return [Math.max(...p.map(fit))];
  });

  const scores = pop.map(fit);
  const best = Math.max(...scores);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const ranked = pop.map((g, i) => ({ g, f: scores[i] })).sort((a, b) => b.f - a.f);

  const reset = (size: number) => {
    const p = makePop(size);
    setPop(p);
    setGen(0);
    setHist([Math.max(...p.map(fit))]);
  };
  const run = (k: number) => {
    let p = pop;
    let g = gen;
    const h = [...hist];
    for (let i = 0; i < k; i++) {
      p = step(p, Number(mut), xo === "1");
      g += 1;
      h.push(Math.max(...p.map(fit)));
      if (Math.max(...p.map(fit)) === MAX) break;
    }
    setPop(p);
    setGen(g);
    setHist(h.slice(-80));
  };

  return (
    <div className="stack">
      <div>
        <h1>OneMax — najprostszy algorytm genetyczny</h1>
        <p className="muted">Genom: 20 bitów. Fitness = liczba jedynek. Cel: same jedynki.</p>
      </div>
      {best === MAX ? (
        <Callout tone="ok" title="Optimum">
          Pokolenie {gen}: 20/20 jedynek.
        </Callout>
      ) : (
        <Callout tone="info" title="Co obserwować">
          Przy mutacji 5% i krzyżowaniu zwykle zbiega w kilkanaście pokoleń. 15% mutacji = szum.
        </Callout>
      )}
      <div className="row">
        <Stat value={`${best} / ${MAX}`} label="Najlepszy fitness" tone={best === MAX ? "ok" : undefined} />
        <Stat value={mean.toFixed(1)} label="Średni fitness" />
        <Stat value={String(gen)} label="Pokolenie" />
      </div>
      <div className="row">
        <Field label="Populacja">
          <Select
            value={n}
            onChange={(v) => {
              setN(v);
              reset(Number(v));
            }}
            options={[
              { value: "12", label: "12" },
              { value: "24", label: "24" },
              { value: "40", label: "40" },
            ]}
          />
        </Field>
        <Field label="Mutacja">
          <Select
            value={mut}
            onChange={setMut}
            options={[
              { value: "0.01", label: "1%" },
              { value: "0.05", label: "5%" },
              { value: "0.15", label: "15%" },
            ]}
          />
        </Field>
        <Field label="Krzyżowanie">
          <Select
            value={xo}
            onChange={setXo}
            options={[
              { value: "1", label: "Włączone" },
              { value: "0", label: "Wyłączone" },
            ]}
          />
        </Field>
        <Button onClick={() => run(1)}>+1 pokolenie</Button>
        <Button variant="primary" onClick={() => run(20)}>
          +20 pokoleń
        </Button>
        <Button onClick={() => reset(Number(n))}>Przywróć start</Button>
      </div>
      <h2>Fitness w pokoleniach</h2>
      <LineChart
        categories={hist.map((_, i) => String(i))}
        series={[{ name: "Najlepszy", data: hist, color: chartGreen }]}
        reference={{ value: MAX, label: "optimum" }}
      />
      <h2>Ranking</h2>
      <Table
        headers={["#", "Fitness", "Genom"]}
        align={["l", "r", "l"]}
        rows={ranked.slice(0, 8).map((r, i) => [String(i + 1), `${r.f}/${MAX}`, r.g.join("")])}
      />
    </div>
  );
}
