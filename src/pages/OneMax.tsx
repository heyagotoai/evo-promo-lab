import { useState } from "react";
import { Button, Callout, Field, LineChart, NumberInput, Select, Stat, Table, chartGreen } from "../ui";
import { makeRng, type Rng } from "../lib/rng";

const L = 20;
const MAX = L;

function fit(g: number[]) {
  return g.reduce((a, b) => a + b, 0);
}
function randG(rng: Rng): number[] {
  return Array.from({ length: L }, () => (rng() < 0.5 ? 1 : 0));
}
function makePop(n: number, rng: Rng) {
  return Array.from({ length: n }, () => randG(rng));
}
function bestFit(pop: number[][]) {
  return Math.max(...pop.map(fit));
}
function tournament(pop: number[][], rng: Rng, k = 3) {
  let best = pop[Math.floor(rng() * pop.length)];
  let bf = fit(best);
  for (let i = 1; i < k; i++) {
    const c = pop[Math.floor(rng() * pop.length)];
    const f = fit(c);
    if (f > bf) {
      best = c;
      bf = f;
    }
  }
  return best;
}
function step(pop: number[][], mut: number, xo: boolean, rng: Rng) {
  const ranked = [...pop].sort((a, b) => fit(b) - fit(a));
  const next = [ranked[0].slice(), ranked[1].slice()];
  while (next.length < pop.length) {
    const a = tournament(pop, rng);
    const b = tournament(pop, rng);
    const cut = Math.floor(rng() * L);
    let child = xo && rng() < 0.9 ? a.slice(0, cut).concat(b.slice(cut)) : a.slice();
    child = child.map((bit) => (rng() < mut ? 1 - bit : bit));
    next.push(child);
  }
  return next;
}

type Run = { rng: Rng; pop: number[][]; gen: number; hist: number[] };

/** Jeden obiekt stanu: wykres i ranking zawsze pokazują tę samą populację. */
function startRun(size: number, seed: number): Run {
  const rng = makeRng(seed);
  const pop = makePop(size, rng);
  return { rng, pop, gen: 0, hist: [bestFit(pop)] };
}

export function OneMaxPage() {
  const [n, setN] = useState("24");
  const [mut, setMut] = useState("0.05");
  const [xo, setXo] = useState("1");
  const [seed, setSeed] = useState("1");
  const [run, setRun] = useState<Run>(() => startRun(24, 1));

  const scores = run.pop.map(fit);
  const best = Math.max(...scores);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const ranked = run.pop.map((g, i) => ({ g, f: scores[i] })).sort((a, b) => b.f - a.f);

  const reset = (size: number, s: number) => setRun(startRun(size, s >>> 0));

  // Generator ma stan wewnętrzny, więc kolejne pokolenia liczymy w obsłudze
  // zdarzenia, a do setState idzie gotowa wartość. Funkcja aktualizująca
  // musi być czysta — React wywołuje ją więcej niż raz.
  const advance = (k: number) => {
    let pop = run.pop;
    let gen = run.gen;
    const hist = [...run.hist];
    for (let i = 0; i < k; i++) {
      pop = step(pop, Number(mut), xo === "1", run.rng);
      gen += 1;
      hist.push(bestFit(pop));
      if (bestFit(pop) === MAX) break;
    }
    setRun({ rng: run.rng, pop, gen, hist: hist.slice(-80) });
  };

  return (
    <div className="stack">
      <div>
        <h1>OneMax — najprostszy algorytm genetyczny</h1>
        <p className="muted">Genom: 20 bitów. Fitness = liczba jedynek. Cel: same jedynki.</p>
      </div>
      {best === MAX ? (
        <Callout tone="ok" title="Optimum">
          Pokolenie {run.gen}: 20/20 jedynek.
        </Callout>
      ) : (
        <Callout tone="info" title="Co obserwować">
          Przy mutacji 5% i krzyżowaniu zwykle zbiega w kilkanaście pokoleń. 15% mutacji = szum. Ziarno
          losowe zapisz — ten sam numer odtworzy dokładnie ten sam przebieg.
        </Callout>
      )}
      <div className="row">
        <Stat value={`${best} / ${MAX}`} label="Najlepszy fitness" tone={best === MAX ? "ok" : undefined} />
        <Stat value={mean.toFixed(1)} label="Średni fitness" />
        <Stat value={String(run.gen)} label="Pokolenie" />
      </div>
      <div className="row">
        <Field label="Populacja">
          <Select
            value={n}
            onChange={(v) => {
              setN(v);
              reset(Number(v), Number(seed));
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
        <Field label="Ziarno losowe">
          <NumberInput
            value={seed}
            step="1"
            onChange={(v) => {
              setSeed(v);
              reset(Number(n), Number(v));
            }}
          />
        </Field>
        <Button onClick={() => advance(1)}>+1 pokolenie</Button>
        <Button variant="primary" onClick={() => advance(20)}>
          +20 pokoleń
        </Button>
        <Button onClick={() => reset(Number(n), Number(seed))}>Przywróć start</Button>
      </div>
      <h2>Fitness w pokoleniach</h2>
      <LineChart
        categories={run.hist.map((_, i) => String(i))}
        series={[{ name: "Najlepszy", data: run.hist, color: chartGreen }]}
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
