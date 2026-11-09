import { artSegments, artState, deviceArt, deviceLabel, FAN, topology } from "../ascii";
import type { Display, LedColor } from "../model";
import { useReducedMotion, useTick } from "./anim";

export function AsciiArt({ device, display }: { device: string; display: Display }) {
  const st = artState(display);
  const reduced = useReducedMotion();
  const spinning = st.spinning && !reduced;
  const t = useTick(200, spinning);
  const lines = artSegments(deviceArt(device));
  return (
    <div className={`art-wrap t-${display.led} ${st.cls}`}>
      <span className={`art-tag t-${display.led}`}>{st.tag}</span>
      <pre className="art" data-dev={device} aria-hidden="true">
        {lines.map((segs, i) => (
          <span key={i}>
            {i > 0 && "\n"}
            {segs.map((s, j) =>
              s.cls ? (
                <span key={j} className={s.cls}>
                  {s.fan && spinning ? FAN[t % FAN.length] : s.text}
                </span>
              ) : (
                s.text
              ),
            )}
          </span>
        ))}
      </pre>
      <span className="art-cap">{deviceLabel(device)}</span>
    </div>
  );
}

type Tones = Record<string, { tone: LedColor; pulse: boolean }>;

export function Topology({ machines, head, tones, live }: { machines: string[]; head: string; tones: Tones; live: boolean }) {
  return (
    <div className="topo-wrap art-wrap" style={{ margin: 0, height: 84 }}>
      <pre className={`topo${live ? " live" : ""}`} aria-hidden="true">
        {topology(machines, head).map((row, i) => (
          <span key={i}>
            {i > 0 && "\n"}
            {row.map((c, j) => {
              if (typeof c === "string") return c;
              const tone = tones[c.node]?.tone ?? "dim";
              return (
                <span key={j} className={`nd t-${tone}${c.head ? " hd" : ""}`}>
                  {c.head ? "◉" : "○"}
                </span>
              );
            })}
          </span>
        ))}
      </pre>
    </div>
  );
}
