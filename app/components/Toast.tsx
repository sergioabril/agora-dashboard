import { useEffect } from "react";
import { hhmmss } from "../format";
import { Ps1 } from "./Ps1";

export type ToastLine = { k?: string; v: string };
export type ToastData = {
  id: number;
  tone: "red" | "orange";
  status: string;
  code: string;
  cmd?: string;
  lines: ToastLine[];
  at: number;
};

const TTL_MS = 7000;

function Toast({ t, onDismiss }: { t: ToastData; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(t.id), TTL_MS);
    return () => clearTimeout(timer);
  }, [t.id, onDismiss]);
  return (
    <div className={`toast t-${t.tone}`} role={t.tone === "red" ? "alert" : "status"}>
      <div className="fr fr-top">
        <span className="c" aria-hidden="true">╭─</span>
        <span className="ttl">
          ✗ {t.status && `${t.status} `}<b>{t.code}</b>
        </span>
        <span className="fill" aria-hidden="true" />
        <button type="button" className="tx" aria-label="Dismiss" onClick={() => onDismiss(t.id)}>
          [×]
        </button>
        <span className="c" aria-hidden="true">─╮</span>
      </div>
      <div className="fr-body">
        {t.cmd && (
          <div className="t-cmd">
            <Ps1 /> <span className="c2">{t.cmd}</span>
          </div>
        )}
        {t.lines.map((l, i) => (
          <div className="t-ln" key={i}>
            {l.k && <span className="k">{l.k} </span>}
            <span className="v">{l.v}</span>
          </div>
        ))}
      </div>
      <div className="fr fr-bot">
        <span className="c" aria-hidden="true">╰─</span>
        <span className="bl">{hhmmss(t.at)} · esc to dismiss</span>
        <span className="fill" aria-hidden="true" />
        <span className="c" aria-hidden="true">─╯</span>
      </div>
    </div>
  );
}

export function Toasts({ toasts, onDismiss }: { toasts: ToastData[]; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (!toasts.length) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && toasts.forEach((t) => onDismiss(t.id));
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toasts, onDismiss]);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.slice(-4).map((t) => (
        <Toast key={t.id} t={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
