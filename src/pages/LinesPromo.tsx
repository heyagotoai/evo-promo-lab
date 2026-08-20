import { useMemo, useState } from "react";
import {
  BarChart,
  Callout,
  Field,
  LineChart,
  Select,
  Stat,
  Table,
  chartBlue,
  chartGreen,
  pln,
} from "../ui";
import {
  LINES,
  MECH_BY_ID,
  MECH_OPTIONS,
  PRESETS,
  buildCalendar,
  effectiveZlPerLiter,
  onLabel,
  simulate,
  totals,
  zlL,
  type MechId,
  type Mechs,
  type SimParams,
} from "../lib/lines";

export function LinesPromoPage() {
  const [strategy, setStrategy] = useState("protect");
  const [burst, setBurst] = useState("3");
  const [season, setSeason] = useState("1");
  const [cannibal, setCannibal] = useState("0.4");
  const [fatigue, setFatigue] = useState("0.14");
  const [pantry, setPantry] = useState("0.12");
  const [cogsScale, setCogsScale] = useState("1");
  const [elastScale, setElastScale] = useState("1");
  const [literCap, setLiterCap] = useState("12000");
  const [mEuforia, setMEuforia] = useState<MechId>("d10");
  const [mRetro, setMRetro] = useState<MechId>("d20");
  const [mPycha, setMPycha] = useState<MechId>("g21");
  const [mFlirt, setMFlirt] = useState<MechId>("g11");

  const mechs: Mechs = { euforia: mEuforia, retro: mRetro, pycha: mPycha, flirt: mFlirt };
  const params: SimParams = {
    season: Number(season),
    cannibal: Number(cannibal),
    fatigue: Number(fatigue),
    pantry: Number(pantry),
    cogsScale: Number(cogsScale),
    elastScale: Number(elastScale),
    literCap: Number(literCap),
  };
  const burstN = Number(burst);
  const calendar = buildCalendar(strategy, burstN);
  const rows = simulate(calendar, mechs, params);
  const tot = totals(rows);
  const cmp = PRESETS.map((pr) => ({
    name: pr.label,
    tot: totals(simulate(buildCalendar(pr.id, burstN), mechs, params)),
  }));

  const euEff = effectiveZlPerLiter(LINES[0], MECH_BY_ID[mechs.euforia]);
  const flRegular = zlL(LINES[3]);
  const pyRegular = zlL(LINES[2]);
  const ladderBroken = euEff < flRegular - 0.05;
  const longBurst = burstN >= 6;
  const g22Pycha = mechs.pycha === "g22";
  const euDeep = MECH_BY_ID[mechs.euforia].depth >= 0.3 || MECH_BY_ID[mechs.euforia].id === "g22";

  const impactRows = useMemo(() => {
    const out: string[][] = [
      [
        "Sezon",
        params.season > 1
          ? "Popyt w górę u wszystkich. Promo w szczycie sprzedaje więcej sztuk, ale też więcej darmowych litrów przy 2+2."
          : params.season < 1
            ? "Deszcz / poza sezonem. Głęboka promocja słabiej się spłaca."
            : "Bazowy popyt. Zmiana sezonu skaluje wolumen, nie drabinę cen.",
      ],
      [
        "Mechanika Euforii",
        ladderBroken
          ? `Efektywne ${euEff.toFixed(2)} zł/L — poniżej regularnego Flirt (${flRegular.toFixed(0)} zł/L). Premium podcina budżet.`
          : euDeep
            ? "Głęboka Euforia zbliża się do Retro. Klient przestaje rozumieć, za co dopłaca."
            : `Efektywne ${euEff.toFixed(2)} zł/L. Drabina trzyma się nad Flirt.`,
      ],
      [
        "Pycha vs Retro",
        `Bez promo Pycha to ${pyRegular.toFixed(2)} zł/L, Retro ${zlL(LINES[1]).toFixed(2)} zł/L. Nie stawiaj ich w tym samym tygodniu.`,
      ],
      [
        "Gratis vs %",
        MECH_BY_ID[mechs.flirt].kind === "gratis" || MECH_BY_ID[mechs.pycha].kind === "gratis"
          ? "Gratis: pełny paragon, 1,5–2× sztuk. Marża spada przez COGS darmowych kubków. 2+2 = 50% w litrach + spiżarnia."
          : "Sami %: prostszy paragon, mniej sztuk w mroźni.",
      ],
      [
        "Długość fali",
        longBurst
          ? `${burstN} tyg. tej samej linii: zmęczenie zjada lift, cena referencyjna spada.`
          : `${burstN} tyg. — krótka fala, marka nie zdąży stać się „wiecznie w gazetce”.`,
      ],
      [
        "Kanibalizacja",
        params.cannibal >= 0.5
          ? "Wysoka: przyrost Pychy mocno obcina Retro."
          : "Umiarkowana/niska: promo mniej kradnie siostrze.",
      ],
      [
        "Limit litrów / tydzień",
        rows.some((r) => r.liters >= params.literCap - 1)
          ? "Łańcuch obcina szczyty. 2+2 w upale często się tu rozbija."
          : `Bufor pod ${params.literCap} L/tydz.`,
      ],
      [
        "COGS",
        params.cogsScale > 1
          ? "Drogie lody: 2+2 boli podwójnie. % bywa tańszy niż gratis."
          : params.cogsScale < 1
            ? "Tani wsad: wolumen 2+1 / 2+2 łatwiej obronić marżą."
            : "Bazowy wsad. Patrz marżę, nie tylko obrót.",
      ],
    ];
    if (g22Pycha) {
      out.push([
        "2+2 na Pychy",
        `4 × 1,35 L = 5,4 L za ${pln(44)}. ${effectiveZlPerLiter(LINES[2], MECH_BY_ID.g22).toFixed(2)} zł/L — poniżej regularnego Flirt.`,
      ]);
    }
    return out;
  }, [params, mechs, ladderBroken, euEff, flRegular, pyRegular, longBurst, burstN, rows, g22Pycha]);

  return (
    <div className="stack">
      <div>
        <h1>Cztery linie, nie dwanaście smaków</h1>
        <p className="muted">
          Euforia, Retro, Pycha, Flirt jako mix w kubku. 12 tygodni: marża, litry, kanibalizacja,
          zmęczenie akcji, dołek po gazetce i limit łańcucha.
        </p>
      </div>

      {ladderBroken ? (
        <Callout tone="bad" title="Drabina się wywróciła">
          Euforia schodzi do {euEff.toFixed(2)} zł/L. Flirt regularnie stoi na {flRegular.toFixed(0)} zł/L.
        </Callout>
      ) : strategy === "twoNear" ? (
        <Callout tone="warn" title="Retro i Pycha w tym samym tygodniu">
          To ten sam klient średniej półki. Dwie naklejki kradną sobie wolumen.
        </Callout>
      ) : (
        <Callout tone="info" title="Zł/L, nie tylko kubek">
          Pycha 22 zł / 1,35 L = {pyRegular.toFixed(2)} zł/L, Retro 17 zł/L. Euforia 20 zł za kubek
          wygląda taniej niż Pycha 22 zł — i drożej za litr.
        </Callout>
      )}

      <h2>Drabina regularna</h2>
      <Table
        headers={["Linia", "Półka", "Opakowanie", "Cena", "zł / L", "COGS"]}
        align={["l", "l", "r", "r", "r", "r"]}
        rows={LINES.map((l) => [
          l.name,
          l.shelf,
          `${l.packL.toString().replace(".", ",")} L`,
          pln(l.price),
          `${zlL(l).toFixed(2)} zł`,
          pln(l.cogs),
        ])}
      />

      <h2>Parametry</h2>
      <div className="grid grid-3">
        <Field label="Rotacja 12 tyg.">
          <Select value={strategy} onChange={setStrategy} options={PRESETS.map((p) => ({ value: p.id, label: p.label }))} />
        </Field>
        <Field label="Długość fali">
          <Select
            value={burst}
            onChange={setBurst}
            options={[
              { value: "2", label: "2 tygodnie" },
              { value: "3", label: "3 tygodnie" },
              { value: "4", label: "4 tygodnie" },
              { value: "6", label: "6 tygodni (długo)" },
            ]}
          />
        </Field>
        <Field label="Sezon">
          <Select
            value={season}
            onChange={setSeason}
            options={[
              { value: "0.7", label: "Deszcz ×0,7" },
              { value: "1", label: "Normalny ×1" },
              { value: "1.4", label: "Upał ×1,4" },
            ]}
          />
        </Field>
        <Field label="Euforia">
          <Select value={mEuforia} onChange={(v) => setMEuforia(v as MechId)} options={MECH_OPTIONS} />
        </Field>
        <Field label="Retro">
          <Select value={mRetro} onChange={(v) => setMRetro(v as MechId)} options={MECH_OPTIONS} />
        </Field>
        <Field label="Pycha">
          <Select value={mPycha} onChange={(v) => setMPycha(v as MechId)} options={MECH_OPTIONS} />
        </Field>
        <Field label="Flirt">
          <Select value={mFlirt} onChange={(v) => setMFlirt(v as MechId)} options={MECH_OPTIONS} />
        </Field>
        <Field label="Kanibalizacja">
          <Select
            value={cannibal}
            onChange={setCannibal}
            options={[
              { value: "0.2", label: "Niska" },
              { value: "0.4", label: "Średnia" },
              { value: "0.65", label: "Wysoka" },
            ]}
          />
        </Field>
        <Field label="Zmęczenie fali">
          <Select
            value={fatigue}
            onChange={setFatigue}
            options={[
              { value: "0.06", label: "Słabe" },
              { value: "0.14", label: "Normalne" },
              { value: "0.25", label: "Ostre" },
            ]}
          />
        </Field>
        <Field label="Dołek po promo">
          <Select
            value={pantry}
            onChange={setPantry}
            options={[
              { value: "0.05", label: "Płytki" },
              { value: "0.12", label: "Normalny" },
              { value: "0.22", label: "Głęboki" },
            ]}
          />
        </Field>
        <Field label="COGS">
          <Select
            value={cogsScale}
            onChange={setCogsScale}
            options={[
              { value: "0.85", label: "Tani ×0,85" },
              { value: "1", label: "Bazowy" },
              { value: "1.2", label: "Drogi ×1,2" },
            ]}
          />
        </Field>
        <Field label="Elastyczność">
          <Select
            value={elastScale}
            onChange={setElastScale}
            options={[
              { value: "0.75", label: "Twardy popyt" },
              { value: "1", label: "Bazowa" },
              { value: "1.3", label: "Łowcy okazji" },
            ]}
          />
        </Field>
        <Field label="Limit L / tydzień">
          <Select
            value={literCap}
            onChange={setLiterCap}
            options={[
              { value: "8000", label: "8 tys. L" },
              { value: "12000", label: "12 tys. L" },
              { value: "25000", label: "Bez limitu" },
            ]}
          />
        </Field>
      </div>

      <div className="row">
        <Stat value={pln(tot.margin)} label="Marża 12 tyg." tone={tot.margin < 0 ? "bad" : "ok"} />
        <Stat value={pln(tot.revenue)} label="Obrót 12 tyg." />
        <Stat
          value={`${Math.round(tot.liters).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")} L`}
          label="Litry z mroźni"
        />
        <Stat
          value={`${Math.round(tot.fullPriceEuforia).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")} szt.`}
          label="Euforia regularna"
          tone={euDeep ? "warn" : undefined}
        />
      </div>

      <h2>Efektywna cena za litr</h2>
      <Table
        headers={["Linia", "Mechanika", "zł/L regularnie", "zł/L w akcji", "Sztuk / zapłacone"]}
        align={["l", "l", "r", "r", "r"]}
        tones={LINES.map((l) => {
          const m = MECH_BY_ID[mechs[l.id]];
          const eff = effectiveZlPerLiter(l, m);
          if (l.id === "euforia" && eff < flRegular) return "bad";
          if (l.id === "pycha" && m.id === "g22") return "warn";
          return "neutral";
        })}
        rows={LINES.map((l) => {
          const m = MECH_BY_ID[mechs[l.id]];
          return [l.name, m.label, `${zlL(l).toFixed(2)} zł`, `${effectiveZlPerLiter(l, m).toFixed(2)} zł`, `${m.unitMult}×`];
        })}
      />

      <div className="grid grid-2">
        <div>
          <h2>Marża i obrót</h2>
          <p className="small">Oś Y: zł · oś X: tydzień</p>
          <LineChart
            categories={rows.map((r) => String(r.week))}
            series={[
              { name: "Marża", data: rows.map((r) => Math.round(r.margin)), color: chartGreen },
              { name: "Obrót", data: rows.map((r) => Math.round(r.revenue)), color: chartBlue },
            ]}
            suffix=" zł"
          />
        </div>
        <div>
          <h2>Litry / tydzień</h2>
          <p className="small">Oś Y: litry · kreska = limit</p>
          <LineChart
            categories={rows.map((r) => String(r.week))}
            series={[{ name: "Litry", data: rows.map((r) => Math.round(r.liters)), color: chartBlue }]}
            suffix=" L"
            reference={{ value: params.literCap, label: "limit" }}
          />
        </div>
      </div>

      <h2>Kalendarz rotacji</h2>
      <Table
        headers={["Tydzień", "W gazetce", "Marża", "Obrót", "Litry"]}
        align={["l", "l", "r", "r", "r"]}
        tones={rows.map((r) => {
          if (r.on.includes("retro") && r.on.includes("pycha")) return "bad";
          if (r.on.includes("euforia") && euDeep) return "warn";
          if (r.on.length === 0) return "info";
          return "neutral";
        })}
        rows={rows.map((r) => [String(r.week), onLabel(r.on), pln(r.margin), pln(r.revenue), `${Math.round(r.liters)} L`])}
      />

      <h2>Ta sama mechanika, inna rotacja</h2>
      <p className="small">Oś Y: marża 12 tyg. (zł)</p>
      <BarChart categories={cmp.map((c) => c.name)} values={cmp.map((c) => Math.round(c.tot.margin))} suffix=" zł" />

      <h2>Który parametr na co wpływa</h2>
      <Table headers={["Parametr", "Co się dzieje teraz"]} rows={impactRows} />

      <h2>Reguły</h2>
      <p>
        Kotwica pełnej ceny: zwykle Euforia, krótko i płytko, prawie nigdy 2+2 ani −50%. Flirt ciągnie volume
        (1+1 albo −20/−30). Pychę i Retro rotuj osobno. Fala 2–3 tygodnie, tydzień ciszy. Gratis gdy chcesz
        litry; procent gdy nie chcesz zapychać mroźni. 2+2 to sufit 50% w litrach.
      </p>
    </div>
  );
}
