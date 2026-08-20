import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Callout,
  Checks,
  Field,
  NumberInput,
  Select,
  Stat,
  Table,
  pln,
} from "../ui";
import {
  LINES,
  MECH_BY_ID,
  MECH_OPTIONS,
  affinity,
  type CapMode,
  type LineId,
  type MechId,
} from "../lib/lines";
import { advise, emptySituation, type Observation, type Situation } from "../lib/advisor";
import { saveScenario } from "../lib/scenario";

type ObsForm = {
  line: LineId;
  mech: MechId;
  baseWeek: string;
  promoWeek1: string;
  promoWeek3: string;
  afterWeek: string;
  neighbour: LineId | "";
  neighbourBase: string;
  neighbourPromoWeek: string;
};

const LINE_OPTIONS = LINES.map((l) => ({ value: l.id, label: l.name }));
const PROMO_OPTIONS = MECH_OPTIONS.filter((o) => o.value !== "none");
const EMPTY_STR: Record<LineId, string> = { euforia: "", retro: "", pycha: "", flirt: "" };

function blankObs(line: LineId): ObsForm {
  return {
    line,
    mech: "d20",
    baseWeek: "",
    promoWeek1: "",
    promoWeek3: "",
    afterWeek: "",
    neighbour: "",
    neighbourBase: "",
    neighbourPromoWeek: "",
  };
}

const n = (s: string): number | null => {
  const t = String(s).replace(",", ".").replace(/\s/g, "");
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

const EVIDENCE_LABEL: Record<string, string> = {
  measured: "zmierzone",
  declared: "zadeklarowane",
  default: "DOMYŚLNE",
};

/** Dane demonstracyjne — czytelnie oznaczone, żeby nikt ich nie wziął za pomiar. */
const DEMO: ObsForm[] = [
  {
    line: "flirt",
    mech: "g11",
    baseWeek: "2100",
    promoWeek1: "9500",
    promoWeek3: "8100",
    afterWeek: "1750",
    neighbour: "pycha",
    neighbourBase: "1100",
    neighbourPromoWeek: "820",
  },
  {
    line: "retro",
    mech: "d30",
    baseWeek: "1300",
    promoWeek1: "2000",
    promoWeek3: "1810",
    afterWeek: "1130",
    neighbour: "pycha",
    neighbourBase: "1100",
    neighbourPromoWeek: "930",
  },
];

export function AdvisorPage() {
  const navigate = useNavigate();
  const [obs, setObs] = useState<ObsForm[]>([blankObs("flirt")]);
  const [price, setPrice] = useState<Record<LineId, string>>({ ...EMPTY_STR });
  const [cogs, setCogs] = useState<Record<LineId, string>>({ ...EMPTY_STR });
  const [booked, setBooked] = useState<Record<LineId, string>>({ ...EMPTY_STR });
  const [season, setSeason] = useState<"" | "rain" | "normal" | "heat">("");
  const [capMode, setCapMode] = useState<CapMode>("liters");
  const [cap, setCap] = useState("");
  const [maxLines, setMaxLines] = useState("");
  const [minSilent, setMinSilent] = useState("");
  const [maxBurst, setMaxBurst] = useState("");
  const [volume, setVolume] = useState("");
  const [sameBuyer, setSameBuyer] = useState(true);
  const [demo, setDemo] = useState(false);
  const [saved, setSaved] = useState(false);
  const [inPlan, setInPlan] = useState<Record<LineId, boolean>>({
    euforia: true,
    retro: true,
    pycha: true,
    flirt: true,
  });
  const [anchor, setAnchor] = useState<Record<LineId, boolean>>({
    euforia: true,
    retro: false,
    pycha: false,
    flirt: false,
  });
  const [allowGratis, setAllowGratis] = useState<Record<LineId, boolean>>({
    euforia: false,
    retro: true,
    pycha: true,
    flirt: true,
  });

  const situation: Situation = useMemo(() => {
    const s = emptySituation();
    s.observations = obs.map<Observation>((o) => ({
      line: o.line,
      mech: o.mech,
      baseWeek: n(o.baseWeek),
      promoWeek1: n(o.promoWeek1),
      promoWeek3: n(o.promoWeek3),
      afterWeek: n(o.afterWeek),
      neighbour: o.neighbour === "" ? null : o.neighbour,
      neighbourBase: n(o.neighbourBase),
      neighbourPromoWeek: n(o.neighbourPromoWeek),
    }));
    s.season = season === "" ? null : season;
    s.capMode = capMode;
    s.cap = n(cap);
    s.price = { euforia: n(price.euforia), retro: n(price.retro), pycha: n(price.pycha), flirt: n(price.flirt) };
    s.cogs = { euforia: n(cogs.euforia), retro: n(cogs.retro), pycha: n(cogs.pycha), flirt: n(cogs.flirt) };
    s.bookedWeeks = {
      euforia: n(booked.euforia),
      retro: n(booked.retro),
      pycha: n(booked.pycha),
      flirt: n(booked.flirt),
    };
    s.inPlan = inPlan;
    s.anchor = anchor;
    s.allowGratis = allowGratis;
    s.sameBuyer = sameBuyer ? [["retro", "pycha"]] : [];
    s.maxLinesPerWeek = n(maxLines);
    s.minSilentWeeks = n(minSilent);
    s.maxBurst = n(maxBurst);
    s.volumeCommitment = n(volume);
    return s;
  }, [obs, season, capMode, cap, price, cogs, booked, inPlan, anchor, allowGratis, sameBuyer, maxLines, minSilent, maxBurst, volume]);

  const a = useMemo(() => advise(situation), [situation]);

  const setObsAt = (i: number, patch: Partial<ObsForm>) =>
    setObs((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = () => {
    saveScenario(situation);
    setSaved(true);
  };

  const lineName = (id: LineId) => LINES.find((l) => l.id === id)?.name ?? id;

  return (
    <div className="stack">
      <div>
        <h1>Doradca parametrów</h1>
        <p className="muted">
          Opisz sytuację liczbami, które masz w raportach. Doradca nie zgaduje: każdą gałkę modelu wylicza,
          odwracając ten sam wzór, którego używa symulacja. Czego nie da się policzyć, zostaje wartością
          domyślną — jawnie oznaczoną, z pytaniem, które trzeba zadać, żeby ją zastąpić.
        </p>
      </div>

      <Callout tone="info" title="To nie jest model językowy">
        Tu nie ma nic, co mogłoby coś zmyślić. Każda liczba w tabeli odczytów ma źródło: albo Twoją daną,
        albo etykietę „DOMYŚLNE". Jeśli dane wyglądają na sprzeczne z modelem, doradca mówi o tym wprost
        zamiast dopasowywać wynik.
      </Callout>

      {demo ? (
        <Callout tone="warn" title="Wczytano dane demonstracyjne">
          To są liczby wymyślone na potrzeby pokazu, nie Wasze pomiary. Zanim cokolwiek z tego pokażesz
          na spotkaniu, podmień je na dane z raportu sell-out.
        </Callout>
      ) : null}

      <div className="row">
        <Stat
          value={`${a.confidence.measured} / ${a.confidence.total}`}
          label="Odczytów opartych na Twoich danych"
          tone={a.confidence.level === "wysoka" ? "ok" : a.confidence.level === "średnia" ? "warn" : "bad"}
        />
        <Stat value={a.confidence.level} label="Pewność modelu" />
        <Stat value={String(a.missing.length)} label="Brakujących pomiarów" tone={a.missing.length ? "warn" : "ok"} />
        <Button
          onClick={() => {
            setObs(DEMO);
            setPrice({ euforia: "20", retro: "17", pycha: "22", flirt: "14" });
            setCogs({ euforia: "9", retro: "7.4", pycha: "10.2", flirt: "6.6" });
            setSeason("heat");
            setCap("8000");
            setVolume("78000");
            setBooked({ euforia: "2", retro: "5", pycha: "5", flirt: "6" });
            setDemo(true);
          }}
        >
          Wczytaj przykład
        </Button>
      </div>

      {a.flags.map((f, i) => (
        <Callout key={i} tone={f.level === "bad" ? "bad" : "warn"} title={f.title}>
          {f.text}
        </Callout>
      ))}

      <h2>1. Co sprzedajecie</h2>
      <p className="small">Cennik i kalkulacja kosztu. Bez tych dwóch liczb żaden próg opłacalności nie ma sensu.</p>
      <Checks
        items={LINES.map((l) => ({ id: l.id, label: `${l.name} w planie` }))}
        value={inPlan}
        onToggle={(id) => setInPlan((p) => ({ ...p, [id]: !p[id as LineId] }))}
      />
      <div className="grid grid-4">
        {LINES.map((l) => (
          <Field key={`p-${l.id}`} label={`${l.name} — cena regularna (zł)`}>
            <NumberInput value={price[l.id]} onChange={(v) => setPrice((p) => ({ ...p, [l.id]: v }))} step="0.1" />
          </Field>
        ))}
        {LINES.map((l) => (
          <Field key={`c-${l.id}`} label={`${l.name} — wytworzenie (zł)`}>
            <NumberInput value={cogs[l.id]} onChange={(v) => setCogs((p) => ({ ...p, [l.id]: v }))} step="0.1" />
          </Field>
        ))}
      </div>

      <h2>2. Co się stało na ostatnich akcjach</h2>
      <p className="small">
        Wszystkie liczby w sztukach, z tej samej sieci. „Sztuki w akcji" liczysz razem z gratisowymi — tak,
        jak pokazuje je sell-out. Puste pole to nie zero, tylko „nie mam tej liczby".
      </p>
      {obs.map((o, i) => {
        const aff = o.neighbour === "" ? 0 : affinity(o.line, o.neighbour);
        return (
          <div key={i} className="card">
            <div className="grid grid-3">
              <Field label="Linia">
                <Select value={o.line} onChange={(v) => setObsAt(i, { line: v as LineId })} options={LINE_OPTIONS} />
              </Field>
              <Field label="Mechanika akcji">
                <Select value={o.mech} onChange={(v) => setObsAt(i, { mech: v as MechId })} options={PROMO_OPTIONS} />
              </Field>
              <Field label="Typowy tydzień bez gazetki (szt.)">
                <NumberInput value={o.baseWeek} onChange={(v) => setObsAt(i, { baseWeek: v })} step="1" />
              </Field>
              <Field label="1. tydzień akcji (szt. z gratisami)">
                <NumberInput value={o.promoWeek1} onChange={(v) => setObsAt(i, { promoWeek1: v })} step="1" />
              </Field>
              <Field label="3. tydzień tej samej akcji (szt.)">
                <NumberInput value={o.promoWeek3} onChange={(v) => setObsAt(i, { promoWeek3: v })} step="1" />
              </Field>
              <Field label="1. tydzień po akcji (szt.)">
                <NumberInput value={o.afterWeek} onChange={(v) => setObsAt(i, { afterWeek: v })} step="1" />
              </Field>
              <Field label="Sąsiadka na półce">
                <Select
                  value={o.neighbour}
                  onChange={(v) => setObsAt(i, { neighbour: v as LineId | "" })}
                  options={[{ value: "", label: "— nie mierzyłem —" }, ...LINE_OPTIONS.filter((x) => x.value !== o.line)]}
                />
              </Field>
              <Field label="Sąsiadka — typowy tydzień (szt.)">
                <NumberInput
                  value={o.neighbourBase}
                  onChange={(v) => setObsAt(i, { neighbourBase: v })}
                  step="1"
                />
              </Field>
              <Field label="Sąsiadka — tydzień akcji (szt.)">
                <NumberInput
                  value={o.neighbourPromoWeek}
                  onChange={(v) => setObsAt(i, { neighbourPromoWeek: v })}
                  step="1"
                />
              </Field>
            </div>
            {o.neighbour !== "" && aff === 0 ? (
              <p className="small">
                Model nie widzi przepływu między {lineName(o.line)} a {lineName(o.neighbour)} — z tej pary
                kanibalizacji nie policzy. Wybierz linie stojące obok siebie na półce.
              </p>
            ) : null}
            {obs.length > 1 ? (
              <div className="row">
                <Button onClick={() => setObs((xs) => xs.filter((_, j) => j !== i))}>Usuń tę akcję</Button>
              </div>
            ) : null}
          </div>
        );
      })}
      <div className="row">
        <Button onClick={() => setObs((xs) => [...xs, blankObs("retro")])}>Dodaj kolejną akcję</Button>
        <span className="small">Więcej akcji = uśrednione zmęczenie, dołek i kanibalizacja.</span>
      </div>

      <h2>3. Warunki, w których planujecie</h2>
      <div className="grid grid-3">
        <Field label="Sezon w tych 12 tygodniach">
          <Select
            value={season}
            onChange={(v) => setSeason(v as typeof season)}
            options={[
              { value: "", label: "— nie wiem —" },
              { value: "rain", label: "Deszcz / poza sezonem" },
              { value: "normal", label: "Normalny" },
              { value: "heat", label: "Upał / szczyt" },
            ]}
          />
        </Field>
        <Field label="Limit łańcucha — jednostka">
          <Select
            value={capMode}
            onChange={(v) => setCapMode(v as CapMode)}
            options={[
              { value: "liters", label: "Litry" },
              { value: "cartons", label: "Kartony" },
            ]}
          />
        </Field>
        <Field label={`Ile sieć przyjmie w szczycie (${capMode === "liters" ? "L" : "kart."} / tydz.)`}>
          <NumberInput value={cap} onChange={setCap} step="100" />
        </Field>
        <Field label="Zobowiązanie wolumenowe na 12 tyg. (L)">
          <NumberInput value={volume} onChange={setVolume} step="1000" />
        </Field>
        <Field label="Ile linii naraz wolno wystawić">
          <NumberInput value={maxLines} onChange={setMaxLines} step="1" />
        </Field>
        <Field label="Najdłuższa dopuszczalna fala (tyg.)">
          <NumberInput value={maxBurst} onChange={setMaxBurst} step="1" />
        </Field>
        <Field label="Minimum tygodni bez gazetki">
          <NumberInput value={minSilent} onChange={setMinSilent} step="1" />
        </Field>
        {LINES.map((l) => (
          <Field key={`b-${l.id}`} label={`${l.name} — wykupione tygodnie gazetki`}>
            <NumberInput value={booked[l.id]} onChange={(v) => setBooked((p) => ({ ...p, [l.id]: v }))} step="1" />
          </Field>
        ))}
      </div>
      <p className="small">Kotwica pełnej ceny — linia, której drabiny zł/L pilnujemy:</p>
      <Checks
        items={LINES.map((l) => ({ id: l.id, label: l.name }))}
        value={anchor}
        onToggle={(id) => setAnchor((p) => ({ ...p, [id]: !p[id as LineId] }))}
      />
      <p className="small">Linie, którym wolno wejść w mechanikę gratisową:</p>
      <Checks
        items={LINES.map((l) => ({ id: l.id, label: l.name }))}
        value={allowGratis}
        onToggle={(id) => setAllowGratis((p) => ({ ...p, [id]: !p[id as LineId] }))}
      />
      <Checks
        items={[{ id: "sb", label: "Retro i Pycha to ten sam kupiec — nigdy w tym samym tygodniu" }]}
        value={{ sb: sameBuyer }}
        onToggle={() => setSameBuyer((v) => !v)}
      />

      <h2>Odczyt: skąd bierze się każda liczba</h2>
      <Table
        headers={["Parametr", "Wartość", "Skąd", "Źródło"]}
        align={["l", "r", "l", "l"]}
        tones={a.readings.map((r) =>
          r.evidence === "measured" ? "ok" : r.evidence === "declared" ? "info" : "warn",
        )}
        rows={a.readings.map((r) => [
          r.label,
          r.display,
          EVIDENCE_LABEL[r.evidence],
          r.n && r.n > 1 ? `${r.source} (${r.n} akcje)` : r.source,
        ])}
      />

      {a.missing.length ? (
        <>
          <h2>Czego brakuje — i o co zapytać</h2>
          <p className="small">
            Każda pozycja to jedna liczba. Dopóki jej nie ma, model podstawia wartość domyślną i mówi o tym
            w tabeli wyżej.
          </p>
          <Table
            headers={["Parametr", "Pytanie do zadania", "Gdzie to jest"]}
            align={["l", "l", "l"]}
            tones={a.missing.map(() => "warn")}
            rows={a.missing.map((m) => [m.label, m.question, m.where])}
          />
        </>
      ) : (
        <Callout tone="ok" title="Komplet danych">
          Wszystkie gałki modelu stoją na Twoich liczbach. Bezwzględne kwoty można pokazywać.
        </Callout>
      )}

      <h2>Które mechaniki w ogóle się zwracają</h2>
      <p className="small">
        Liczone z Twojej ceny i kosztu wytworzenia. „Potrzeba" to elastyczność, przy której akcja wychodzi
        na zero wobec tygodnia bez gazetki.
      </p>
      <Table
        headers={["Linia", "Mechanika", "Marża na opakowaniu", "Elastyczność", "Potrzeba", "Werdykt"]}
        align={["l", "l", "r", "r", "r", "l"]}
        tones={a.breakEven.map((b) =>
          b.verdict === "ok" ? "ok" : b.verdict === "cienko" ? "warn" : "bad",
        )}
        rows={a.breakEven.map((b) => [
          lineName(b.line),
          MECH_BY_ID[b.mech].label,
          pln(b.packMargin),
          b.have.toFixed(2),
          Number.isFinite(b.need) ? b.need.toFixed(2) : "—",
          b.verdict === "nigdy"
            ? "nie wyjdzie na zero przy żadnym wolumenie"
            : b.verdict === "ok"
              ? "zwraca się"
              : b.verdict === "cienko"
                ? "na styk — bez zapasu na pomyłkę"
                : `pod progiem o ${(b.need - b.have).toFixed(2)}`,
        ])}
      />

      <h2>Co z tego wynika</h2>
      <div className="stack">
        {a.verdict.map((v, i) => (
          <p key={i} className="small">
            {v}
          </p>
        ))}
      </div>

      <div className="row">
        <Button variant="primary" onClick={save}>
          Zapisz scenariusz
        </Button>
        <Button
          onClick={() => {
            save();
            navigate("/plan");
          }}
        >
          Zapisz i policz plan
        </Button>
        {saved ? <span className="small">Zapisane. Optymalizator policzy plan na tych parametrach.</span> : null}
      </div>
    </div>
  );
}
