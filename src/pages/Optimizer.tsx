import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart,
  Button,
  Callout,
  Checks,
  Field,
  LineChart,
  NumberInput,
  Select,
  Stat,
  Table,
  chartGreen,
  pln,
} from "../ui";
import {
  LINES,
  MECH_BY_ID,
  MECH_OPTIONS,
  PRESETS,
  WEEKS,
  breakEvenElasticity,
  buildCalendar,
  effectiveZlPerLiter,
  onLabel,
  reachable,
  simulate,
  totals,
  type LineId,
  type MechId,
  type Mechs,
  type SimParams,
} from "../lib/lines";
import {
  DEFAULT_GOAL,
  DEFAULT_GUARDS,
  auditPlan,
  buildAllowed,
  evaluate,
  initOptimizer,
  planFromCalendar,
  runOptimizer,
  type Goal,
  type Guards,
  type Objective,
  type OptCtx,
  type OptState,
} from "../lib/optimize";
import { advise } from "../lib/advisor";
import { knobsFor, stressTest, stressVerdict } from "../lib/robust";
import { copyTSV, downloadCSV, planReport, reportFilename } from "../lib/exportPlan";
import { loadScenario, savedAtLabel, type StoredScenario } from "../lib/scenario";

const OBJECTIVE_LABEL: Record<Objective, string> = {
  margin: "Marża 12 tyg.",
  liters: "Litry 12 tyg.",
  revenue: "Obrót 12 tyg.",
};

const num = (s: string, fallback: number) => {
  const n = Number(String(s).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : fallback;
};

const fmt = (n: number) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export function OptimizerPage() {
  const [scenario, setScenario] = useState<StoredScenario | null>(null);
  useEffect(() => setScenario(loadScenario()), []);

  const advice = useMemo(() => (scenario ? advise(scenario.situation) : null), [scenario]);

  const [objective, setObjective] = useState<Objective>("margin");
  const [holdVolume, setHoldVolume] = useState("1");
  const [seed, setSeed] = useState("42");
  const [maxBurst, setMaxBurst] = useState("3");
  const [minGap, setMinGap] = useState("1");
  const [maxLines, setMaxLines] = useState("2");
  const [minSilent, setMinSilent] = useState("2");
  const [ladder, setLadder] = useState<Guards["ladder"]>("cheapest");
  const [separateNear, setSeparateNear] = useState(true);
  const [respectCap, setRespectCap] = useState(false);
  const [euforiaCap, setEuforiaCap] = useState("0.2");
  const [current, setCurrent] = useState<Mechs>({
    euforia: "d10",
    retro: "d20",
    pycha: "g21",
    flirt: "g11",
  });
  const [inPlan, setInPlan] = useState<Record<LineId, boolean>>({
    euforia: true,
    retro: true,
    pycha: true,
    flirt: true,
  });

  // Parametry rynku: ze scenariusza doradcy, jeśli jest; inaczej wartości modelowe.
  // Tożsamość obu obiektów musi być stabilna — od niej zależy, czy policzony
  // przebieg przeżyje kolejny render.
  const params: SimParams = useMemo(
    () =>
      advice?.params ?? {
        season: 1,
        cannibal: 0.4,
        fatigue: 0.14,
        pantry: 0.12,
        elastScale: 1,
        capMode: "liters",
        cap: 8000,
      },
    [advice],
  );
  const allLines = advice?.lines ?? LINES;
  const lines = useMemo(() => allLines.filter((l) => inPlan[l.id]), [allLines, inPlan]);

  const guards: Guards = useMemo(() => {
    const base = advice?.guards ?? DEFAULT_GUARDS;
    const maxDepth = { ...base.maxDepth, euforia: num(euforiaCap, 0.2) };
    for (const id of Object.keys(maxDepth) as LineId[]) if (!inPlan[id]) maxDepth[id] = 0;
    const maxPromoWeeks = { ...base.maxPromoWeeks };
    for (const id of Object.keys(maxPromoWeeks) as LineId[]) if (!inPlan[id]) maxPromoWeeks[id] = 0;
    return {
      ...base,
      maxDepth,
      maxPromoWeeks,
      maxBurst: num(maxBurst, 3),
      minGap: num(minGap, 1),
      maxLinesPerWeek: num(maxLines, 2),
      minSilentWeeks: num(minSilent, 2),
      ladder,
      forbidPairs: separateNear ? ([["retro", "pycha"]] as [LineId, LineId][]) : [],
    };
  }, [advice, euforiaCap, maxBurst, minGap, maxLines, minSilent, ladder, separateNear, inPlan]);

  // Punkt odniesienia: najlepszy z sześciu presetów przy tej samej mechanice i tych samych parametrach.
  const presetRuns = useMemo(
    () =>
      PRESETS.map((pr) => {
        const cal = buildCalendar(pr.id, 3).map((w) => w.filter((id) => inPlan[id]));
        const rows = simulate(cal, current, params, lines);
        return { ...pr, plan: planFromCalendar(cal, current, lines), tot: totals(rows) };
      }),
    [current, params, lines, inPlan],
  );
  const baseline = presetRuns.reduce((b, r) => (r.tot.margin > b.tot.margin ? r : b), presetRuns[0]);

  const goal: Goal = useMemo(
    () => ({
      ...DEFAULT_GOAL,
      objective,
      minLiters: objective !== "liters" && holdVolume === "1" ? baseline.tot.liters : 0,
      minMargin: objective !== "margin" && holdVolume === "1" ? baseline.tot.margin : 0,
      noCapOverflow: respectCap,
    }),
    [objective, holdVolume, baseline, respectCap],
  );

  const ctx: OptCtx = useMemo(
    () => ({
      lines,
      params,
      guards,
      goal,
      allowed: buildAllowed(lines, guards),
      popSize: 60,
      mutation: 0.08,
    }),
    [lines, params, guards, goal],
  );

  const [state, setState] = useState<OptState | null>(null);
  const [copied, setCopied] = useState(false);
  // Każda zmiana reguł, celu albo składu linii unieważnia poprzedni przebieg —
  // inaczej na ekranie zostałby plan policzony pod inne zasady.
  useEffect(() => setState(null), [ctx]);

  const start = (generations: number) => {
    const seeds = presetRuns.map((r) => r.plan);
    const s0 = state ?? initOptimizer(ctx, num(seed, 42) >>> 0, seeds);
    setState(runOptimizer(s0, ctx, generations));
  };

  const best = state?.best ?? null;
  const ev = state?.bestEval ?? null;
  const rows = ev?.rows ?? [];
  const checks = best && ev ? auditPlan(best, lines, guards, params, ev) : [];
  const baseEv = useMemo(
    () => evaluate(baseline.plan, lines, params, goal),
    [baseline, lines, params, goal],
  );
  const baseChecks = auditPlan(baseline.plan, lines, guards, params, baseEv);
  const baseBroken = baseChecks.filter((c) => !c.ok && c.kind === "rule");

  // Ile waży tydzień bez żadnej gazetki — pokazuje, ile miejsca zostaje pod limitem.
  const baseLoad = useMemo(() => {
    const quiet = simulate(
      Array.from({ length: WEEKS }, () => [] as LineId[]),
      current,
      { ...params, cap: Number.POSITIVE_INFINITY },
      lines,
    );
    return params.capMode === "liters" ? quiet[0].liters : quiet[0].cartons;
  }, [current, params, lines]);

  // Odporność: ten sam plan i ten sam punkt odniesienia przepuszczone przez
  // siatkę zaburzeń parametrów. Nie szukamy planu na nowo — sprawdzamy,
  // czy znaleziony przeżywa niepewność danych, na których stanął.
  const knobs = useMemo(() => knobsFor(lines, advice?.readings ?? null), [lines, advice]);
  const stress = useMemo(() => {
    if (!best) return null;
    return stressTest({
      plan: best,
      reference: baseline.plan,
      lines,
      params,
      goal,
      knobs,
      n: 200,
      seed: num(seed, 42) >>> 0,
    });
  }, [best, baseline, lines, params, goal, knobs, seed]);
  const verdict = stress ? stressVerdict(stress) : null;

  const spread = useMemo(() => {
    if (!stress) return [];
    const sorted = [...stress.deltas].sort((a, b) => a - b);
    return Array.from({ length: 41 }, (_, i) => {
      const q = i / 40;
      return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
    });
  }, [stress]);

  const report = () =>
    best && ev
      ? planReport({
          now: new Date(),
          plan: best,
          rows: ev.rows,
          tot: ev.tot,
          lines,
          params,
          goal,
          seed: num(seed, 42) >>> 0,
          generations: state?.gen ?? 0,
          baselineLabel: baseline.label,
          baselineTot: baseline.tot,
          checks,
          readings: advice?.readings ?? null,
          confidence: advice?.confidence ?? null,
          stress,
        })
      : null;

  const deltaMargin = ev ? ev.tot.margin - baseline.tot.margin : 0;
  const deltaLiters = ev ? ev.tot.liters - baseline.tot.liters : 0;
  const allSilent = best ? best.every((w) => lines.every((l) => MECH_BY_ID[w[l.id]].kind === "off")) : false;

  const breakEven = useMemo(() => {
    const out: { line: LineId; mech: MechId; have: number; need: number; ok: boolean; can: boolean }[] = [];
    for (const l of lines) {
      for (const m of MECH_OPTIONS) {
        const mech = MECH_BY_ID[m.value as MechId];
        if (mech.kind === "off") continue;
        if (mech.depth > guards.maxDepth[l.id] + 1e-9) continue;
        if (mech.kind === "gratis" && !guards.allowGratis[l.id]) continue;
        const need = breakEvenElasticity(l, mech);
        out.push({
          line: l.id,
          mech: mech.id,
          have: l.elasticity * params.elastScale,
          need,
          ok: l.elasticity * params.elastScale >= need,
          can: reachable(l, mech),
        });
      }
    }
    return out;
  }, [lines, guards, params]);
  const anyPays = breakEven.some((b) => b.ok && b.can);

  return (
    <div className="stack">
      <div>
        <h1>Optymalizator kalendarza promo</h1>
        <p className="muted">
          Algorytm ewolucyjny szuka mechaniki dla każdej linii w każdym z {WEEKS} tygodni. Reguły handlowe
          są twarde: plan, który je łamie, w ogóle nie wychodzi z optymalizatora.
        </p>
      </div>

      {scenario && advice ? (
        <Callout tone="ok" title={`Scenariusz z Doradcy (zapisany ${savedAtLabel(scenario.savedAt)})`}>
          Ceny, koszty i parametry rynku pochodzą z Twoich danych — {advice.confidence.measured} z{" "}
          {advice.confidence.total} odczytów jest zmierzonych, pewność {advice.confidence.level}.{" "}
          <Link to="/doradca">Wróć do Doradcy</Link>, żeby je zmienić.
        </Callout>
      ) : (
        <Callout tone="warn" title="Liczysz na wartościach modelowych">
          Nie ma zapisanego scenariusza, więc ceny, koszty i reakcja rynku są syntetyczne. Wyniki traktuj
          jako ranking wariantów, nie jako prognozę złotówek. <Link to="/doradca">Przejdź do Doradcy</Link>,
          żeby podstawić swoje liczby.
        </Callout>
      )}

      <h2>Linie w planie</h2>
      <Checks
        items={allLines.map((l) => ({ id: l.id, label: l.name }))}
        value={inPlan}
        onToggle={(id) => setInPlan((p) => ({ ...p, [id]: !p[id as LineId] }))}
      />

      <h2>Brief</h2>
      <div className="grid grid-3">
        <Field label="Co maksymalizujemy">
          <Select
            value={objective}
            onChange={(v) => setObjective(v as Objective)}
            options={[
              { value: "margin", label: "Marżę" },
              { value: "liters", label: "Litry" },
              { value: "revenue", label: "Obrót" },
            ]}
          />
        </Field>
        <Field label={objective === "margin" ? "Wolumen" : "Marża"}>
          <Select
            value={holdVolume}
            onChange={setHoldVolume}
            options={[
              {
                value: "1",
                label: objective === "margin" ? "Nie schodzić poniżej dzisiejszej" : "Nie schodzić poniżej dzisiejszej",
              },
              { value: "0", label: "Bez progu" },
            ]}
          />
        </Field>
        <Field label="Ziarno losowe">
          <NumberInput value={seed} onChange={setSeed} step="1" />
        </Field>
      </div>
      <p className="small">
        Punktem odniesienia jest najlepszy z sześciu presetów rotacji przy tej samej mechanice —
        dziś wygrywa „{baseline.label}" z marżą {pln(baseline.tot.margin)} i {fmt(baseline.tot.liters)} L.
        {holdVolume === "1"
          ? objective === "margin"
            ? " Optymalizator musi dowieźć co najmniej tyle litrów."
            : " Optymalizator musi dowieźć co najmniej tyle marży."
          : " Bez progu — wynik może dowieźć mniej wolumenu."}
      </p>

      <h2>Dzisiejsza mechanika (punkt odniesienia)</h2>
      <div className="grid grid-4">
        {allLines.map((l) => (
          <Field key={l.id} label={l.name}>
            <Select
              value={current[l.id]}
              onChange={(v) => setCurrent((c) => ({ ...c, [l.id]: v as MechId }))}
              options={MECH_OPTIONS}
            />
          </Field>
        ))}
      </div>

      <h2>Twarde reguły</h2>
      <div className="grid grid-3">
        <Field label="Najdłuższa fala jednej linii">
          <Select
            value={maxBurst}
            onChange={setMaxBurst}
            options={[1, 2, 3, 4, 6].map((n) => ({ value: String(n), label: `${n} tyg.` }))}
          />
        </Field>
        <Field label="Cisza po fali">
          <Select
            value={minGap}
            onChange={setMinGap}
            options={[0, 1, 2, 3].map((n) => ({ value: String(n), label: n ? `${n} tyg.` : "bez wymogu" }))}
          />
        </Field>
        <Field label="Linii naraz w tygodniu">
          <Select
            value={maxLines}
            onChange={setMaxLines}
            options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
          />
        </Field>
        <Field label="Tygodni bez gazetki">
          <Select
            value={minSilent}
            onChange={setMinSilent}
            options={[0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: `min. ${n}` }))}
          />
        </Field>
        <Field label="Ochrona drabiny zł/L">
          <Select
            value={ladder}
            onChange={(v) => setLadder(v as Guards["ladder"])}
            options={[
              { value: "cheapest", label: "Premium nie pod najtańszą" },
              { value: "strict", label: "Premium nie w średnią półkę" },
              { value: "off", label: "Brak ochrony" },
            ]}
          />
        </Field>
        <Field label="Maks. głębokość Euforii">
          <Select
            value={euforiaCap}
            onChange={setEuforiaCap}
            options={[
              { value: "0", label: "nigdy w gazetce" },
              { value: "0.1", label: "do −10%" },
              { value: "0.2", label: "do −20%" },
              { value: "0.3", label: "do −30%" },
              { value: "0.5", label: "bez limitu" },
            ]}
          />
        </Field>
      </div>
      <Checks
        items={[
          { id: "near", label: "Retro i Pycha nigdy w tym samym tygodniu" },
          { id: "cap", label: "Żaden tydzień nie przebija limitu łańcucha" },
        ]}
        value={{ near: separateNear, cap: respectCap }}
        onToggle={(id) => (id === "near" ? setSeparateNear((v) => !v) : setRespectCap((v) => !v))}
      />

      {baseLoad / params.cap >= 0.85 ? (
        <Callout tone="warn" title="Limit łańcucha jest wyczerpany samą sprzedażą regularną">
          Bez żadnej gazetki tydzień waży {fmt(baseLoad)}{" "}
          {params.capMode === "liters" ? "L" : "kart."} przy limicie {fmt(params.cap)} — to{" "}
          {Math.round((baseLoad / params.cap) * 100)}% sufitu. Każda akcja produkuje wolumen, którego sieć
          nie przyjmie: w modelu nadwyżka jest ucinana, w rzeczywistości stoi na rampie albo nie wchodzi
          w zamówienie. Zanim policzysz plan, zweryfikuj limit z logistyką.
        </Callout>
      ) : null}

      {baseBroken.length ? (
        <Callout tone="bad" title={`Dzisiejszy plan łamie ${baseBroken.length} z tych reguł`}>
          {baseBroken.map((c) => `${c.rule} (${c.detail})`).join(" · ")}. Optymalizator nie ma prawa
          zwrócić planu z taką wadą, więc porównanie jest do planu, którego i tak nie powinno się puścić.
        </Callout>
      ) : (
        <Callout tone="info" title="Dzisiejszy plan przechodzi wszystkie reguły">
          Punkt odniesienia jest legalny — różnica w wyniku bierze się z układu tygodni, nie z obejścia zasad.
        </Callout>
      )}

      <div className="row">
        <Button onClick={() => start(1)}>+1 pokolenie</Button>
        <Button variant="primary" onClick={() => start(60)}>
          +60 pokoleń
        </Button>
        <Button onClick={() => setState(null)}>Od nowa</Button>
        <span className="small">
          {state ? `Pokolenie ${state.gen} · populacja 60` : "Populacja startowa zawiera 6 obecnych presetów"}
        </span>
      </div>

      {ev && best ? (
        <>
          <div className="row">
            <Stat
              value={pln(ev.tot.margin)}
              label={`Marża 12 tyg. (${deltaMargin >= 0 ? "+" : "−"}${pln(Math.abs(deltaMargin)).replace(" zł", "")} zł vs dziś)`}
              tone={deltaMargin > 0 ? "ok" : deltaMargin < 0 ? "bad" : undefined}
            />
            <Stat
              value={`${fmt(ev.tot.liters)} L`}
              label={`Litry (${deltaLiters >= 0 ? "+" : "−"}${fmt(Math.abs(deltaLiters))} L vs dziś)`}
              tone={deltaLiters >= 0 ? "ok" : "warn"}
            />
            <Stat value={pln(ev.tot.revenue)} label="Obrót 12 tyg." />
            <Stat
              value={pln(ev.worstWeek)}
              label="Najsłabszy tydzień"
              tone={ev.worstWeek < 0 ? "bad" : undefined}
            />
            <Stat
              value={ev.feasible ? "spełniony" : "niespełniony"}
              label="Brief"
              tone={ev.feasible ? "ok" : "bad"}
            />
          </div>

          <div className="row">
            <Button
              variant="primary"
              onClick={async () => {
                const r = report();
                if (!r) return;
                setCopied(await copyTSV(r));
              }}
            >
              Kopiuj plan do arkusza
            </Button>
            <Button
              onClick={() => {
                const r = report();
                if (r) downloadCSV(r, reportFilename(new Date()));
              }}
            >
              Pobierz CSV
            </Button>
            <span className="small">
              {copied
                ? "Skopiowane — wklej do Excela albo Arkuszy, kolumny same się rozłożą."
                : "Raport niesie kalendarz, parametry ze źródłem, podsumowanie, listę reguł i wynik testu odporności."}
            </span>
          </div>

          {!ev.feasible ? (
            <Callout tone="bad" title="Tego briefu nie da się spełnić naraz">
              Optymalizator przeszukał przestrzeń i nie znalazł planu, który spełnia wszystkie warunki —
              pokazany jest ten, który łamie je najmniej. Niedowiezione:{" "}
              {[
                goal.minLiters > 0 && ev.tot.liters < goal.minLiters
                  ? `wolumen ${fmt(ev.tot.liters)} L z wymaganych ${fmt(goal.minLiters)} L`
                  : null,
                goal.minMargin > 0 && ev.tot.margin < goal.minMargin
                  ? `marża ${pln(ev.tot.margin)} z wymaganych ${pln(goal.minMargin)}`
                  : null,
                goal.noCapOverflow && ev.cappedWeeks > 0
                  ? `${ev.cappedWeeks} ${ev.cappedWeeks === 1 ? "tydzień przebija" : "tyg. przebija"} limit łańcucha`
                  : null,
              ]
                .filter(Boolean)
                .join("; ")}
              . To jest wynik do eskalacji, nie do obejścia: coś musi ustąpić — próg wolumenu, limit
              łańcucha albo któraś z reguł. Zmień jeden warunek i policz ponownie, żeby zobaczyć, który
              z nich kosztuje najmniej.
            </Callout>
          ) : null}

          {allSilent ? (
            <Callout tone="bad" title="Optymalizator mówi: nie rób żadnej promocji">
              Przy tych cenach, kosztach i reakcji rynku każda dozwolona mechanika oddaje więcej marży, niż
              odzyskuje wolumenem — tabela progów niżej pokazuje, o ile. To jest wynik, nie awaria. Jeśli
              akcja i tak musi się odbyć (listing, zobowiązanie wolumenowe, obrona przed konkurencją),
              przestaw cel na litry albo obrót i zostaw próg marży — dostaniesz najtańszy sposób dowiezienia
              tego wolumenu.
            </Callout>
          ) : !anyPays ? (
            <Callout tone="warn" title="Żadna mechanika nie przekracza progu opłacalności">
              Plan poniżej dowozi wolumen, ale każdy tydzień gazetki kosztuje marżę. Traktuj go jako
              najtańszy sposób kupienia litrów, nie jako sposób na zarobek.
            </Callout>
          ) : null}

          <h2>Znaleziony plan</h2>
          <Table
            headers={["Tydzień", "W gazetce", "Mechanika", "Marża", "Litry", "Limit"]}
            align={["l", "l", "l", "r", "r", "l"]}
            tones={rows.map((r) => (r.capped ? "warn" : r.on.length === 0 ? "info" : "ok"))}
            rows={rows.map((r, i) => [
              String(r.week),
              onLabel(r.on),
              lines
                .filter((l) => MECH_BY_ID[best[i][l.id]].kind !== "off")
                .map((l) => `${l.name} ${MECH_BY_ID[best[i][l.id]].label}`)
                .join(" · ") || "—",
              pln(r.margin),
              fmt(r.liters),
              r.capped ? "przycięty" : "",
            ])}
          />

          <h2>Dlaczego ten plan wolno puścić</h2>
          <p className="small">
            Reguły są twarde — optymalizator naprawia każdy plan przed oceną, więc nie da się dostać wyniku,
            który którąś z nich łamie. Skutki to nie zasady, tylko to, co z planu wychodzi i co trzeba
            zobaczyć przed wysłaniem gazetki.
          </p>
          <Table
            headers={["Pozycja", "Rodzaj", "Wynik", "Dowód"]}
            align={["l", "l", "l", "l"]}
            tones={checks.map((c) => (c.ok ? "ok" : c.kind === "rule" ? "bad" : "warn"))}
            rows={checks.map((c) => [
              c.rule,
              c.kind === "rule" ? "reguła" : "skutek",
              c.ok ? (c.kind === "rule" ? "spełniona" : "czysto") : c.kind === "rule" ? "ZŁAMANA" : "uwaga",
              c.detail,
            ])}
          />

          {stress && verdict ? (
            <>
              <h2>Odporność na niepewność parametrów</h2>
              <p className="small">
                Ten sam plan i ten sam punkt odniesienia przepuszczone przez {stress.n} scenariuszy rynku.
                Parametry, których nikt nie zmierzył, są zaburzane szeroko (±40%), zmierzone wąsko (±15%) —
                więc niepewność danych wchodzi do wyniku, zamiast wisieć w przypisie. To nie jest ponowna
                optymalizacja: sprawdzamy, czy znaleziony plan broni się bez strojenia pod scenariusz.
              </p>
              <p className="small">
                Dwa wskaźniki mówią o czym innym i mogą się rozjeżdżać. „Bije dzisiejszy" porównuje oba
                plany w tym samym rynku. „Brief spełniony" sprawdza próg podany w liczbach bezwzględnych —
                w słabszym rynku potrafi go nie dowieźć nikt, dlatego obok podana jest ta sama wartość dla
                dzisiejszego planu. Jeśli oba są niskie, problem jest w rynku albo w progu, nie w planie.
              </p>
              <Callout tone={verdict.tone} title="Werdykt">
                {verdict.text}
              </Callout>
              <div className="row">
                <Stat
                  value={`${Math.round(stress.winRate * 100)}%`}
                  label="Scenariuszy, w których plan bije dzisiejszy"
                  tone={stress.winRate >= 0.95 ? "ok" : stress.winRate >= 0.8 ? "warn" : "bad"}
                />
                <Stat
                  value={`${Math.round(stress.feasibleRate * 100)}%`}
                  label={`Brief spełniony (dzisiejszy plan: ${Math.round(stress.refFeasibleRate * 100)}%)`}
                  tone={stress.feasibleRate >= stress.refFeasibleRate ? "ok" : "warn"}
                />
                <Stat value={pln(stress.medianDelta)} label="Przewaga — mediana" />
                <Stat
                  value={pln(stress.p05Delta)}
                  label="Przewaga — najgorsze 5%"
                  tone={stress.p05Delta > 0 ? "ok" : "bad"}
                />
                <Stat value={pln(stress.worstDelta)} label="Przewaga — najgorszy przypadek" />
              </div>
              <div className="grid grid-2">
                <div>
                  <h2>Rozkład przewagi</h2>
                  <p className="small">
                    Oś Y: przewaga nad dzisiejszym planem (zł) · oś X: percentyl scenariuszy · kreska = zero
                  </p>
                  <LineChart
                    categories={spread.map((_, i) => String(i * 2.5))}
                    series={[{ name: "Przewaga", data: spread.map((v) => Math.round(v)), color: chartGreen }]}
                    suffix=" zł"
                    reference={{ value: 0, label: "próg opłacalności zmiany" }}
                  />
                </div>
                <div>
                  <h2>Co zmierzyć najpierw</h2>
                  <p className="small">
                    Który parametr najmocniej rusza przewagą, gdy przesunąć go po własnym paśmie niepewności.
                    Góra tabeli to pomiar, którego brak kosztuje najwięcej.
                  </p>
                  <Table
                    headers={["Parametr", "Pasmo", "Źródło", "Wpływ na przewagę"]}
                    align={["l", "r", "l", "r"]}
                    tones={stress.sensitivity.map((r) =>
                      r.evidence === "measured" ? "ok" : r.evidence === "declared" ? "info" : "warn",
                    )}
                    rows={stress.sensitivity.map((r) => [
                      r.label,
                      `±${Math.round(r.band * 100)}%`,
                      r.evidence === "measured"
                        ? "zmierzone"
                        : r.evidence === "declared"
                          ? "zadeklarowane"
                          : "DOMYŚLNE",
                      pln(r.swing),
                    ])}
                  />
                </div>
              </div>
            </>
          ) : null}

          <div className="grid grid-2">
            <div>
              <h2>Zbieżność</h2>
              <p className="small">Oś Y: {OBJECTIVE_LABEL[objective].toLowerCase()} · oś X: pokolenie</p>
              <LineChart
                categories={state!.history.map((_, i) => String(i))}
                series={[
                  {
                    name: OBJECTIVE_LABEL[objective],
                    data: state!.history.map((v) => Math.round(v)),
                    color: chartGreen,
                  },
                ]}
                reference={{
                  value: Math.round(
                    objective === "margin"
                      ? baseline.tot.margin
                      : objective === "liters"
                        ? baseline.tot.liters
                        : baseline.tot.revenue,
                  ),
                  label: "dziś",
                }}
              />
            </div>
            <div>
              <h2>Marża: presety vs optymalizator</h2>
              <p className="small">Oś Y: marża 12 tyg. (zł)</p>
              <BarChart
                categories={[...presetRuns.map((p) => p.chart), ["Optymali-", "zator"]]}
                values={[...presetRuns.map((p) => Math.round(p.tot.margin)), Math.round(ev.tot.margin)]}
                suffix=" zł"
              />
            </div>
          </div>
        </>
      ) : (
        <Callout tone="info" title="Uruchom optymalizator">
          Populacja startowa zawiera sześć presetów, którymi dziś planujecie rotację, więc wynik nigdy nie
          będzie gorszy od dzisiejszego planu. Ziarno losowe zapisz — ten sam numer odtworzy dokładnie ten
          sam przebieg na prezentacji.
        </Callout>
      )}

      <h2>Próg opłacalności mechaniki</h2>
      <p className="small">
        Liczone wprost z ceny regularnej i kosztu wytworzenia — bez żadnego założenia o rynku. „Potrzeba" to
        elastyczność, przy której akcja wychodzi dokładnie na zero wobec tygodnia bez gazetki.
      </p>
      <Table
        headers={["Linia", "Mechanika", "Elastyczność", "Potrzeba", "Werdykt"]}
        align={["l", "l", "r", "r", "l"]}
        tones={breakEven.map((b) => (!b.can ? "bad" : b.ok ? "ok" : "warn"))}
        rows={breakEven.map((b) => [
          LINES.find((l) => l.id === b.line)?.name ?? b.line,
          MECH_BY_ID[b.mech].label,
          b.have.toFixed(2),
          Number.isFinite(b.need) ? b.need.toFixed(2) : "—",
          !b.can
            ? "nie wyjdzie na zero przy żadnym wolumenie"
            : b.ok
              ? `zarabia — zapas ${(b.have - b.need).toFixed(2)}`
              : `pod progiem o ${(b.need - b.have).toFixed(2)}`,
        ])}
      />

      <h2>Efektywna cena za litr w znalezionym planie</h2>
      <Table
        headers={["Linia", "Regularnie", "Najgłębiej w planie", "Tygodni w gazetce"]}
        align={["l", "r", "r", "r"]}
        rows={lines.map((l) => {
          const used = best ? best.map((w) => w[l.id]) : [];
          const deepest = used.reduce<MechId>(
            (a, b) => (MECH_BY_ID[b].depth > MECH_BY_ID[a].depth ? b : a),
            "none",
          );
          const weeks = used.filter((m) => MECH_BY_ID[m].kind !== "off").length;
          return [
            l.name,
            `${(l.price / l.packL).toFixed(2)} zł`,
            best ? `${effectiveZlPerLiter(l, MECH_BY_ID[deepest]).toFixed(2)} zł (${MECH_BY_ID[deepest].label})` : "—",
            best ? String(weeks) : "—",
          ];
        })}
      />
    </div>
  );
}

