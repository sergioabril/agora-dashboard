const p2 = (n: number) => String(n).padStart(2, "0");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const toMs = (v: string | number | null | undefined) => (typeof v === "number" ? v : v ? Date.parse(v) : NaN);

export function ago(v: string | number | null, now: number): string {
  const t = toMs(v);
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 2) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export function hhmmss(v: string | number | null): string {
  const d = new Date(toMs(v));
  return isNaN(d.getTime()) ? "—" : `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

export function hhmm(v: string | number | null, now: number): string {
  const d = new Date(toMs(v));
  if (isNaN(d.getTime())) return "—";
  const t = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  return d.toDateString() === new Date(now).toDateString() ? t : `${MON[d.getMonth()]} ${d.getDate()} ${t}`;
}

export function stamp(v: string | number | null): string {
  const d = new Date(toMs(v));
  return isNaN(d.getTime()) ? "—" : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${hhmmss(v)}`;
}

export function dur(a: string, b: string): string {
  const s = Math.max(0, Math.round((toMs(b) - toMs(a)) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m${p2(s % 60)}s` : `${Math.floor(m / 60)}h${p2(m % 60)}m`;
}

export function elapsed(v: string | null, now: number): string {
  const s = Math.max(0, Math.floor((now - toMs(v)) / 1000));
  return Number.isFinite(s) ? `${p2(Math.floor(s / 60))}:${p2(s % 60)}` : "--:--";
}
