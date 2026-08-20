import { emptySituation, type Situation } from "./advisor";

const KEY = "evo-promo-lab:scenario";

export type StoredScenario = { situation: Situation; savedAt: string };

export function saveScenario(situation: Situation): StoredScenario | null {
  const payload: StoredScenario = { situation, savedAt: new Date().toISOString() };
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
    return payload;
  } catch {
    return null;
  }
}

export function loadScenario(): StoredScenario | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredScenario;
    if (!parsed || typeof parsed !== "object" || !parsed.situation) return null;
    // Uzupełnia pola dodane po zapisaniu scenariusza, żeby stary zapis się nie wysypał.
    return { savedAt: parsed.savedAt, situation: { ...emptySituation(), ...parsed.situation } };
  } catch {
    return null;
  }
}

export function clearScenario(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* prywatne okno albo zablokowane dane witryny — pracujemy bez zapisu */
  }
}

export function savedAtLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
