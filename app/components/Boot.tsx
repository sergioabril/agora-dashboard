import { useEffect, useState } from "react";
import { useReducedMotion } from "./anim";
import { MonoSpin } from "./Spinner";

export type BootResult = null | { ok: true; ms: number; count: number } | { ok: false; error: string };

type Props = { machines: BootResult; deployments: BootResult; done: boolean };

const ts = (ms: number) => `[${(ms / 1000).toFixed(3).padStart(6, " ")}]`;

function Line({ delay, at, children }: { delay: number; at: number; children: React.ReactNode }) {
  return (
    <div className="bl" style={{ "--d": `${delay}ms` } as React.CSSProperties}>
      <span className="ts">{ts(at)}</span>
      {children}
    </div>
  );
}

function Result({ r, noun }: { r: BootResult; noun: string }) {
  if (!r) return <span className="res"><MonoSpin /> waiting</span>;
  if (!r.ok) return <span className="res"><span className="er">ERR</span> {r.error}</span>;
  return <span className="res"><span className="ok">200</span> · {r.count} {noun} · {Math.round(r.ms)}ms</span>;
}

export function PowerOn() {
  const reduced = useReducedMotion();
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), reduced ? 0 : 1100);
    return () => clearTimeout(t);
  }, [reduced]);
  return gone ? null : <div className="poweron" aria-hidden="true"><i /></div>;
}

export function Boot({ machines, deployments, done }: Props) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!done) return setHidden(false);
    const t = setTimeout(() => setHidden(true), 600);
    return () => clearTimeout(t);
  }, [done]);
  if (hidden) return null;
  const ready = machines?.ok && deployments?.ok ? machines.count + deployments.count : null;
  return (
    <section className={`boot${done ? " done" : ""}`} aria-label="Connecting to hub">
      <div className="boot-in">
        <div className="bootlog">
          <Line delay={300} at={0}>
            <span>phosphor/tty0 · agora-dashboard</span><span className="lead" /><span className="ok">attached</span>
          </Line>
          <Line delay={520} at={machines?.ok ? machines.ms : 0}>
            <span>GET <span className="hi">/admin/machines/status</span></span><span className="lead" />
            <Result r={machines} noun="machines" />
          </Line>
          <Line delay={700} at={deployments?.ok ? deployments.ms : 0}>
            <span>GET <span className="hi">/admin/deployments/status</span></span><span className="lead" />
            <Result r={deployments} noun="deployments" />
          </Line>
          {ready !== null && (
            <Line delay={0} at={Math.max(machines?.ok ? machines.ms : 0, deployments?.ok ? deployments.ms : 0)}>
              <span className="res2"><span className="hi">session ready</span> <span className="ok">▸</span> streaming {ready} cards</span>
            </Line>
          )}
        </div>
      </div>
    </section>
  );
}
