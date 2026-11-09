import type { LedColor } from "../model";

export function Led({ tone, pulse = false }: { tone: LedColor; pulse?: boolean }) {
  return <i className={`led t-${tone}${pulse ? " pulse" : ""}`} />;
}

export function Status({ tone, pulse, label }: { tone: LedColor; pulse: boolean; label: string }) {
  return (
    <span className={`stx t-${tone}`}>
      <Led tone={tone} pulse={pulse} />
      {label}
    </span>
  );
}
