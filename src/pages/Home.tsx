import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <div className="stack">
      <div>
        <h1>Laboratorium promocji i ewolucji</h1>
        <p className="muted">
          Od opisu sytuacji, przez parametry wyliczone z Waszych danych, po kalendarz promo znaleziony
          algorytmem ewolucyjnym — plus trzy przykłady dydaktyczne, na których widać, jak taki algorytm działa.
        </p>
      </div>
      <h2>Ścieżka robocza</h2>
      <div className="cards">
        <Link to="/doradca" className="card">
          <h3>1. Doradca parametrów</h3>
          <p className="small">
            Opisujesz sytuację liczbami z raportów. Doradca odwraca wzór modelu i mówi, która gałka jest
            zmierzona, a która domyślna — plus czego brakuje i o co zapytać.
          </p>
        </Link>
        <Link to="/plan" className="card">
          <h3>2. Optymalizator kalendarza</h3>
          <p className="small">
            Algorytm ewolucyjny szuka mechaniki na 12 tygodni × 4 linie. Reguły handlowe są twarde:
            plan, który je łamie, nie wychodzi z optymalizatora.
          </p>
        </Link>
        <Link to="/linie" className="card">
          <h3>3. Presety rotacji</h3>
          <p className="small">
            Sześć gotowych rotacji na tym samym modelu. Punkt odniesienia i intuicja: kanibalizacja,
            drabina zł/L, limit łańcucha.
          </p>
        </Link>
      </div>
      <h2>Jak działa algorytm ewolucyjny</h2>
      <div className="cards">
        <Link to="/handlowiec" className="card">
          <h3>Dzień handlowca</h3>
          <p className="small">Kogo odwiedzić w 6 godzin. Fitness w złotówkach, nie w kilometrach.</p>
        </Link>
        <Link to="/trasa" className="card">
          <h3>Kolejność wizyt</h3>
          <p className="small">Dlaczego „jedź do najbliższego" zostawia półtorej godziny na stole.</p>
        </Link>
        <Link to="/onemax" className="card">
          <h3>OneMax</h3>
          <p className="small">Najprostszy algorytm genetyczny: 20 bitów, licz jedynki.</p>
        </Link>
      </div>
    </div>
  );
}
