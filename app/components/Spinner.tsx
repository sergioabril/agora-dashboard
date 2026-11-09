import { AURORA, SP_ACT, SP_MONO, SP_WAIT, waveStr } from "../ascii";
import { useReducedMotion, useTick } from "./anim";

export function ActiveGlyph() {
  const reduced = useReducedMotion();
  const t = useTick(200, !reduced);
  if (reduced) return <span className="spin">◆</span>;
  const color = AURORA[Math.floor(t / 1.5) % AURORA.length];
  return (
    <span className="spin" style={{ color, textShadow: `0 0 8px ${color}` }}>
      {SP_ACT[t % SP_ACT.length]}
    </span>
  );
}

export function MonoSpin() {
  const reduced = useReducedMotion();
  const t = useTick(100, !reduced);
  return <span aria-hidden="true">{reduced ? "◆" : SP_MONO[t % SP_MONO.length]}</span>;
}

export function Spinner({ variant, label }: { variant: "active" | "waiting"; label: string }) {
  const reduced = useReducedMotion();
  const t = useTick(variant === "active" ? 100 : 500, !reduced);
  if (variant === "waiting") {
    return (
      <div className="spinner wait" role="status" aria-label="waiting for the hub">
        <span className="spin" aria-hidden="true">{reduced ? "◆" : SP_WAIT[t % SP_WAIT.length]}</span>
        <span className="bz">{label}</span>
      </div>
    );
  }
  return (
    <div className="spinner act" role="status">
      <ActiveGlyph />
      <span className="wave" aria-hidden="true">{waveStr(reduced ? 0 : t)}</span>
      <span className="bz">{label}</span>
    </div>
  );
}
