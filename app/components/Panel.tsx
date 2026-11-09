import type { ReactNode } from "react";
import type { Display } from "../model";
import { Led } from "./Led";
import { Ps1 } from "./Ps1";

type Props = { id: string; cmd: string; noun: string; displays: Display[] | null; className?: string; children: ReactNode };

export function Panel({ id, cmd, noun, displays, className = "", children }: Props) {
  const counts = new Map<string, { d: Display; n: number }>();
  for (const d of displays ?? []) {
    const k = `${d.led}|${d.label}`;
    counts.set(k, { d, n: (counts.get(k)?.n ?? 0) + 1 });
  }
  const total = displays?.length ?? 0;
  return (
    <section className="panel" aria-labelledby={id}>
      <h2 className="ph" id={id}>
        <span aria-hidden="true"><Ps1 /></span> <span className="cmd">{cmd} <span className="flag">--status</span></span>
        <span className="rule" aria-hidden="true" />
        {displays && (
          <span className="sum">
            <span className="tot">{total} {noun}{total === 1 ? "" : "s"}</span>
            {[...counts].map(([k, { d, n }]) => (
              <span key={k} className={`sm t-${d.led}`}>
                <Led tone={d.led} />
                {n} {d.label}
              </span>
            ))}
          </span>
        )}
      </h2>
      <div className={`grid ${className}`}>{children}</div>
    </section>
  );
}
