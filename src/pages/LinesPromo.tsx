import { useMemo, useState } from "react";
import {
  BarChart,
  Callout,
  Field,
  LineChart,
  NumberInput,
  Select,
  Stat,
  Table,
  chartBlue,
  chartGreen,
  pln,
} from "../ui";
import {
  CARTON,
  CARTON_CAP_OPTIONS,
  LITER_CAP_OPTIONS,
  MECH_BY_ID,
  MECH_OPTIONS,
  PRESETS,
  applyPrices,
  buildCalendar,
  effectiveZlPerLiter,
  onLabel,
  simulate,
  totals,
  zlL,
  type CapMode,
  type LineId,
  type MechId,
  type Mechs,
  type SimParams,
} from "../lib/lines";

function num(s: string, fallback: number) {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function fmtN(n: number) {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
}

const PARAM_GUIDE: string[][] = [
  [
    "Sezon",
    "Z kalendarza i pogody, nie z głębokości gazetki. Deszcz / poza sezonem ×0,7; lipiec–sierpień upał ×1,4. Skaluje popyt wszystkich linii naraz.",
  ],
  [
    "Kanibalizacja",
    "Czy klient po promocji jednej linii odstawia sąsiadkę na półce. Retro ↔ Pycha zwykle wysoka; Euforia ↔ Flirt niska. Sprawdź: po naklejce Pychy spada Retro w tym samym sklepie?",
  ],
  [
    "Zmęczenie fali",
    "Porównaj tydzień 1 i 3 tej samej naklejki. Jeśli lift wyraźnie pada — ostre. Jeśli gazetka „się nie nudzi” — słabe. Model obcina lift z każdym kolejnym tygodniem fali.",
  ],
  [
    "Dołek po promo",
    "Czy tydzień po akcji lodówka klienta jest pełna. Gratis (zwłaszcza 2+2) daje głębszy dołek niż %. Jeśli sell-out wraca od razu — płytki; jeśli tydzień ciszy jest martwy — głęboki.",
  ],
  [
    "Elastyczność",
    "Ile sztuk dochodzi na procent zniżki. Dyskont i Flirt = łowcy okazji; lojalna Euforia = twardszy popyt. Gałka skaluje lift wszystkich linii naraz.",
  ],
  [
    "Limit łańcucha",
    "Z logistyki: litry gdy mroźnia liczy L, kartony gdy paleta (Euforia/Retro 6 szt., Pycha 4, Flirt 8). Ustaw wartość, przy której zwykle uderzacie w sufit — nie „średni tydzień”.",
  ],
  [
    "Cena i wytworzenie",
    "Z cennika i kalkulacji. Marża sztukowa = cena regularna − COGS. Gratis zjada marżę darmowymi kubkami. Jeśli COGS > cena, minus jest już bez gazetki.",
  ],
  [
    "Długość fali",
    "2–3 tygodnie to norma. 4+ tylko gdy chcesz zobaczyć, jak zmęczenie zjada marżę. Po fali zostaw tydzień ciszy.",
  ],
  [
    "Mechanika",
    "% gdy nie chcesz zapychać mroźni. 1+1 / 2+1 gdy chcesz litry. 2+2 = maksimum 50% w litrach + najgłębsza spiżarnia. Euforii prawie nigdy −50% ani 2+2 — drabina zł/L się wywraca.",
  ],
];

export function LinesPromoPage() {
  const [strategy, setStrategy] = useState("protect");
  const [burst, setBurst] = useState("3");
  const [season, setSeason] = useState("1");
  const [cannibal, setCannibal] = useState("0.4");
  const [fatigue, setFatigue] = useState("0.14");
  const [pantry, setPantry] = useState("0.12");
  const [elastScale, setElastScale] = useState("1");
  const [capMode, setCapMode] = useState<CapMode>("liters");
  const [literCap, setLiterCap] = useState("8000");
  const [cartonCap, setCartonCap] = useState("400");
  const [mEuforia, setMEuforia] = useState<MechId>("d10");
  const [mRetro, setMRetro] = useState<MechId>("d20");
  const [mPycha, setMPycha] = useState<MechId>("g21");
  const [mFlirt, setMFlirt] = useState<MechId>("g11");
  const [pEuforia, setPEuforia] = useState("20");
  const [pRetro, setPRetro] = useState("17");
  const [pPycha, setPPycha] = useState("22");
  const [pFlirt, setPFlirt] = useState("14");
  const [cEuforia, setCEuforia] = useState("9");
  const [cRetro, setCRetro] = useState("7.4");
  const [cPycha, setCPycha] = useState("10.2");
  const [cFlirt, setCFlirt] = useState("6.6");

  const price: Record<LineId, number> = {
    euforia: num(pEuforia, 20),
    retro: num(pRetro, 17),
    pycha: num(pPycha, 22),
    flirt: num(pFlirt, 14),
  };
  const cogs: Record<LineId, number> = {
    euforia: num(cEuforia, 9),
    retro: num(cRetro, 7.4),
    pycha: num(cPycha, 10.2),
    flirt: num(cFlirt, 6.6),
  };
  const live = applyPrices(price, cogs);
  const byId = Object.fromEntries(live.map((l) => [l.id, l])) as Record<LineId, (typeof live)[0]>;

  const mechs: Mechs = { euforia: mEuforia, retro: mRetro, pycha: mPycha, flirt: mFlirt };
  const cap = capMode === "liters" ? Number(literCap) : Number(cartonCap);
  const params: SimParams = {
    season: Number(season),
    cannibal: Number(cannibal),
    fatigue: Number(fatigue),
    pantry: Number(pantry),
    elastScale: Number(elastScale),
    capMode,
    cap,
  };
  const burstN = Number(burst);
  const calendar = buildCalendar(strategy, burstN);
  const rows = simulate(calendar, mechs, params, live);
  const tot = totals(rows);
  const cmp = PRESETS.map((pr) => ({
    name: pr.label,
    tot: totals(simulate(buildCalendar(pr.id, burstN), mechs, params, live)),
  }));

  const eu = byId.euforia;
  const re = byId.retro;
  const py = byId.pycha;
  const fl = byId.flirt;
  const euEff = effectiveZlPerLiter(eu, MECH_BY_ID[mechs.euforia]);
  const flRegular = zlL(fl);
  const pyRegular = zlL(py);
  const ladderBroken = euEff < flRegular - 0.05;
  const longBurst = burstN >= 6;
  const g22Pycha = mechs.pycha === "g22";
  const euDeep = MECH_BY_ID[mechs.euforia].depth >= 0.3 || MECH_BY_ID[mechs.euforia].id === "g22";
  const cogsAbovePrice = live.some((l) => l.cogs > l.price);
  const hitCap = rows.some((r) =>
    capMode === "liters" ? r.liters >= cap - 1 : r.cartons >= cap - 0.5,
  );

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
        `Bez promo Pycha to ${pyRegular.toFixed(2)} zł/L, Retro ${zlL(re).toFixed(2)} zł/L. Nie stawiaj ich w tym samym tygodniu.`,
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
        "Limit łańcucha",
        hitCap
          ? capMode === "liters"
            ? `Limit ${cap} L/tydz. obcina szczyty. 2+2 w upale często się tu rozbija.`
            : `Limit ${cap} kartonów/tydz. obcina szczyty (Euforia/Retro 6 szt., Pycha 4, Flirt 8).`
          : capMode === "liters"
            ? `Bufor pod ${cap} L/tydz.`
            : `Bufor pod ${cap} kartonów/tydz. (Euforia/Retro 6, Pycha 4, Flirt 8).`,
      ],
      [
        "Cena wytworzenia vs regularna",
        cogsAbovePrice
          ? "COGS wyższy niż cena regularna — każda sztuka regularna też jest stratą, nie tylko promo."
          : "Marża sztukowa = cena regularna − wytworzenie; 2+2 zjada ją darmowymi kubkami.",
      ],
    ];
    if (g22Pycha) {
      out.push([
        "2+2 na Pychy",
        `4 × 1,35 L = 5,4 L za ${pln(2 * py.price)}. ${effectiveZlPerLiter(py, MECH_BY_ID.g22).toFixed(2)} zł/L.`,
      ]);
    }
    return out;
  }, [
    params,
    mechs,
    ladderBroken,
    euEff,
    flRegular,
    pyRegular,
    longBurst,
    burstN,
    hitCap,
    cap,
    capMode,
    cogsAbovePrice,
    g22Pycha,
    re,
    py,
  ]);

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
          Pycha {pln(py.price)} / 1,35 L = {pyRegular.toFixed(2)} zł/L, Retro {zlL(re).toFixed(2)} zł/L.
          Euforia {pln(eu.price)} za kubek może wyglądać taniej niż Pycha — i drożej za litr.
        </Callout>
      )}
      {cogsAbovePrice ? (
        <Callout tone="bad" title="Wytworzenie droższe niż cena regularna">
          Popraw COGS albo cenę — inaczej nawet dzień bez gazetki jest na minusie.
        </Callout>
      ) : null}

      <h2>Ceny i drabina</h2>
      <div className="grid grid-4">
        <Field label="Euforia — cena regularna (zł)">
          <NumberInput value={pEuforia} onChange={setPEuforia} step="0.1" />
        </Field>
        <Field label="Euforia — wytworzenie (zł)">
          <NumberInput value={cEuforia} onChange={setCEuforia} step="0.1" />
        </Field>
        <Field label="Retro — cena regularna (zł)">
          <NumberInput value={pRetro} onChange={setPRetro} step="0.1" />
        </Field>
        <Field label="Retro — wytworzenie (zł)">
          <NumberInput value={cRetro} onChange={setCRetro} step="0.1" />
        </Field>
        <Field label="Pycha — cena regularna (zł)">
          <NumberInput value={pPycha} onChange={setPPycha} step="0.1" />
        </Field>
        <Field label="Pycha — wytworzenie (zł)">
          <NumberInput value={cPycha} onChange={setCPycha} step="0.1" />
        </Field>
        <Field label="Flirt — cena regularna (zł)">
          <NumberInput value={pFlirt} onChange={setPFlirt} step="0.1" />
        </Field>
        <Field label="Flirt — wytworzenie (zł)">
          <NumberInput value={cFlirt} onChange={setCFlirt} step="0.1" />
        </Field>
      </div>
      <Table
        headers={["Linia", "Półka", "Opakowanie", "Karton", "Cena", "zł / L", "Wytworzenie"]}
        align={["l", "l", "r", "r", "r", "r", "r"]}
        rows={live.map((l) => [
          l.name,
          l.shelf,
          `${l.packL.toString().replace(".", ",")} L`,
          `${CARTON[l.id]} szt.`,
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
        <Field label="Limit łańcucha — jednostka">
          <Select
            value={capMode}
            onChange={(v) => setCapMode(v as CapMode)}
            options={[
              { value: "liters", label: "Litry (tysiące)" },
              { value: "cartons", label: "Kartony (setki)" },
            ]}
          />
        </Field>
        {capMode === "liters" ? (
          <Field label="Limit L / tydzień">
            <Select value={literCap} onChange={setLiterCap} options={LITER_CAP_OPTIONS} />
          </Field>
        ) : (
          <Field label="Limit kartonów / tydzień">
            <Select value={cartonCap} onChange={setCartonCap} options={CARTON_CAP_OPTIONS} />
          </Field>
        )}
      </div>

      <h2>Jak oceniać parametry</h2>
      <p className="small">
        Model jest syntetyczny. Ustaw gałki tak, żeby opisywały Wasz rynek, nie „ładny wykres”.
      </p>
      <Table headers={["Parametr", "Jak to ocenić"]} rows={PARAM_GUIDE} />

      <div className="row">
        <Stat value={pln(tot.margin)} label="Marża 12 tyg." tone={tot.margin < 0 ? "bad" : "ok"} />
        <Stat value={pln(tot.revenue)} label="Obrót 12 tyg." />
        <Stat value={`${fmtN(tot.liters)} L`} label="Litry z mroźni" />
        <Stat
          value={`${fmtN(tot.cartons)} kart.`}
          label="Kartony 12 tyg."
          tone={capMode === "cartons" && hitCap ? "warn" : undefined}
        />
        <Stat
          value={`${fmtN(tot.fullPriceEuforia)} szt.`}
          label="Euforia regularna"
          tone={euDeep ? "warn" : undefined}
        />
      </div>

      <h2>Efektywna cena za litr</h2>
      <Table
        headers={["Linia", "Mechanika", "zł/L regularnie", "zł/L w akcji", "Sztuk / zapłacone"]}
        align={["l", "l", "r", "r", "r"]}
        tones={live.map((l) => {
          const m = MECH_BY_ID[mechs[l.id]];
          const eff = effectiveZlPerLiter(l, m);
          if (l.id === "euforia" && eff < flRegular) return "bad";
          if (l.id === "pycha" && m.id === "g22") return "warn";
          return "neutral";
        })}
        rows={live.map((l) => {
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
          <h2>{capMode === "liters" ? "Litry / tydzień" : "Kartony / tydzień"}</h2>
          <p className="small">
            Oś Y: {capMode === "liters" ? "litry" : "kartony"} · kreska = limit {fmtN(cap)}
            {capMode === "liters" ? " L" : " kart."}
          </p>
          <LineChart
            categories={rows.map((r) => String(r.week))}
            series={[
              capMode === "liters"
                ? { name: "Litry", data: rows.map((r) => Math.round(r.liters)), color: chartBlue }
                : { name: "Kartony", data: rows.map((r) => Math.round(r.cartons)), color: chartBlue },
            ]}
            suffix={capMode === "liters" ? " L" : ""}
            reference={{ value: cap, label: "limit" }}
          />
        </div>
      </div>

      <h2>Kalendarz rotacji</h2>
      <Table
        headers={["Tydzień", "W gazetce", "Marża", "Obrót", "Litry", "Kartony"]}
        align={["l", "l", "r", "r", "r", "r"]}
        tones={rows.map((r) => {
          if (r.on.includes("retro") && r.on.includes("pycha")) return "bad";
          if (r.on.includes("euforia") && euDeep) return "warn";
          if (r.on.length === 0) return "info";
          return "neutral";
        })}
        rows={rows.map((r) => [
          String(r.week),
          onLabel(r.on),
          pln(r.margin),
          pln(r.revenue),
          `${Math.round(r.liters)} L`,
          `${Math.round(r.cartons)}`,
        ])}
      />

      <h2>Ta sama mechanika, inna rotacja</h2>
      <p className="small">Oś Y: marża 12 tyg. (zł)</p>
      <BarChart categories={cmp.map((c) => c.name)} values={cmp.map((c) => Math.round(c.tot.margin))} suffix=" zł" />

      <h2>Co robią teraz Twoje ustawienia</h2>
      <p className="small">To odczyt bieżących gałek — nie instrukcja, jak je dobierać (ta jest wyżej).</p>
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
