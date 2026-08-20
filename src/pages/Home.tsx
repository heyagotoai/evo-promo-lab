import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <div className="stack">
      <div>
        <h1>Laboratorium promocji i ewolucji</h1>
        <p className="muted">
          Interaktywne przykłady algorytmów ewolucyjnych: od OneMax, przez dzień w terenie i trasę
          handlowca lodów, po kalendarz promo czterech linii (Euforia, Retro, Pycha, Flirt).
        </p>
      </div>
      <div className="cards">
        <Link to="/linie" className="card">
          <h3>Cztery linie lodów</h3>
          <p className="small">Promo, 2+2, rotacja 12 tygodni, drabina zł/L. Główna prezentacja.</p>
        </Link>
        <Link to="/handlowiec" className="card">
          <h3>Dzień handlowca</h3>
          <p className="small">Kogo odwiedzić w 6 godzin. Festiwal vs korytarz nadmorski.</p>
        </Link>
        <Link to="/trasa" className="card">
          <h3>Kolejność wizyt</h3>
          <p className="small">Dlaczego „jedź do najbliższego” zostawia półtorej godziny na stole.</p>
        </Link>
        <Link to="/onemax" className="card">
          <h3>OneMax</h3>
          <p className="small">Najprostszy algorytm genetyczny: 20 bitów, licz jedynki.</p>
        </Link>
      </div>
    </div>
  );
}
