import { useEffect, useState } from "react";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(q.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return reduced;
}

let hydrated = false;

// True for components mounted by the first document load (server render and hydration), false for those mounted
// later by a client-side navigation: load-time effects (boot log, typing after the power-on) play only once.
export function useFirstLoad(): boolean {
  const [first] = useState(() => !hydrated);
  useEffect(() => {
    hydrated = true;
  }, []);
  return first;
}

export function useTick(ms: number, enabled = true): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => !document.hidden && setTick((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
  return tick;
}
