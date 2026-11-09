import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

const HOLD_MS = 1000;

type Props = {
  on: boolean;
  disabled?: boolean;
  label: string;
  holdLabel: string;
  tapLabel: string;
  onToggle: (next: boolean) => void;
};

type Hold = { t0: number; raf: number; cells: number; lbl: string };

export function Switch({ on, disabled = false, label, holdLabel, tapLabel, onToggle }: Props) {
  const [p, setP] = useState<number | null>(null);
  const [note, setNote] = useState(false);
  const hold = useRef<Hold | null>(null);
  const hint = useRef<HTMLSpanElement>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function start() {
    if (hold.current || disabled || !on) return;
    clearTimeout(noteTimer.current);
    setNote(false);
    const avail = Math.floor((hint.current?.clientWidth ?? 120) / 6.6);
    let lbl = holdLabel;
    let cells = avail - lbl.length - 3;
    if (cells < 5) [lbl, cells] = ["hold", avail - 7];
    const h: Hold = { t0: performance.now(), raf: 0, cells: Math.max(4, Math.min(16, cells)), lbl };
    hold.current = h;
    const step = (now: number) => {
      if (hold.current !== h) return;
      const v = Math.min(1, (now - h.t0) / HOLD_MS);
      setP(v);
      if (v >= 1) return end(true);
      h.raf = requestAnimationFrame(step);
    };
    h.raf = requestAnimationFrame(step);
  }

  function end(completed: boolean) {
    const h = hold.current;
    if (!h) return;
    cancelAnimationFrame(h.raf);
    hold.current = null;
    setP(null);
    if (completed) return onToggle(false);
    setNote(true);
    noteTimer.current = setTimeout(() => setNote(false), 1600);
  }

  useEffect(() => {
    const release = () => end(false);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("blur", release);
      clearTimeout(noteTimer.current);
      if (hold.current) cancelAnimationFrame(hold.current.raf);
    };
  }, []);

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0 || disabled || !on) return;
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    start();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    if (e.repeat || disabled) return;
    if (on) start();
    else onToggle(true);
  }

  function onKeyUp(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    end(false);
  }

  const h = hold.current;
  const n = h && p !== null ? Math.round(p * h.cells) : 0;
  return (
    <>
      <span className={`hint${note ? " note" : ""}`} ref={hint} data-idle={disabled ? "" : on ? holdLabel : tapLabel}>
        {h && p !== null ? (
          <>
            <span className="hb">
              [<span className="hb-f">{"█".repeat(n)}</span>
              <span className="hb-e">{"░".repeat(h.cells - n)}</span>]
            </span>{" "}
            <span className="hl">{h.lbl}</span>
          </>
        ) : note ? (
          "hold 1s to confirm"
        ) : null}
      </span>
      <div className="ctl">
        <button
          type="button"
          className={`sw ${on ? "is-on" : "is-off"}${p !== null ? " is-holding" : ""}`}
          role="switch"
          aria-checked={on}
          aria-label={label}
          aria-disabled={disabled || undefined}
          title={on ? holdLabel : tapLabel}
          style={p !== null ? ({ "--p": p.toFixed(3) } as React.CSSProperties) : undefined}
          onPointerDown={onPointerDown}
          onPointerUp={() => end(false)}
          onPointerCancel={() => end(false)}
          onBlur={() => end(false)}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onClick={(e) => {
            e.preventDefault();
            if (!disabled && !on) onToggle(true);
          }}
        >
          <span className="sw-track" aria-hidden="true">
            <span className="sw-knob" />
          </span>
          <span className="sw-lbl" aria-hidden="true">{on ? "on" : "off"}</span>
        </button>
      </div>
    </>
  );
}
