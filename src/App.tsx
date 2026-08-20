import { Link, NavLink, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/Home";
import { IceSalesPage } from "./pages/IceSales";
import { LinesPromoPage } from "./pages/LinesPromo";
import { OneMaxPage } from "./pages/OneMax";
import { WorkdayPage } from "./pages/Workday";

export default function App() {
  return (
    <div className="shell">
      <nav className="nav">
        <Link to="/" className="brand">
          Evo lab
        </Link>
        <NavLink to="/linie">Linie lodów</NavLink>
        <NavLink to="/handlowiec">Handlowiec</NavLink>
        <NavLink to="/trasa">Trasa</NavLink>
        <NavLink to="/onemax">OneMax</NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/linie" element={<LinesPromoPage />} />
        <Route path="/handlowiec" element={<IceSalesPage />} />
        <Route path="/trasa" element={<WorkdayPage />} />
        <Route path="/onemax" element={<OneMaxPage />} />
      </Routes>
    </div>
  );
}
