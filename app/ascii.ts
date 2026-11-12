import type { Display } from "./model";

type DeviceSpec = { label: string; art: string[] };

export const DEVICES: Record<string, DeviceSpec> = {
  "dgx-spark": {
    label: "DGX SPARK",
    art: [
      "  ╭──────────────────────╮",
      " ╭┴─────────────────────╮│",
      " │▓▒░▒▓▒░▒▓▒░▒▓▒░▒▓▒░▒▓▒││",
      " │▒░▒▓▒░▒▓▒░▒▓▒░▒▓▒░▒▓▒░││",
      " │░▒▓▒░▒▓▒░▒▓▒░▒▓▒░▒▓▒░▒├╯",
      " ╰────────────────────●─╯ ",
    ],
  },
  "mac-studio": {
    label: "MAC STUDIO",
    art: [
      "  ╭──────────────────────╮",
      " ╭┴─────────────────────╮│",
      " │······················││",
      " │······················││",
      " │······················││",
      " │·▪·▪·━━·········●·····├╯",
      " ╰──────────────────────╯ ",
    ],
  },
  rtx6000: {
    label: "RTX PRO 6000",
    art: [
      "╭────────────────────────────────╮",
      "│  ╭───╮                  ╭───╮  │",
      "│ ( ─@─ )  ════════════  ( ─@─ ) │",
      "│  ╰───╯    RTX  6000     ╰───╯ ●│",
      "╰────────────────────────────────╯",
      "    ┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃ ┃┃┃┃┃┃┃┃┃   ",
    ],
  },
};

const GENERIC: string[] = [
  "╭──────────────────╮",
  "│ ░░░░░░░░░░░░░░ ● │",
  "│ ░░░░░░░░░░░░░░   │",
  "╰──────────────────╯",
];

export function deviceArt(device: string): string[] {
  return DEVICES[device]?.art ?? GENERIC;
}

export function deviceLabel(device: string): string {
  return DEVICES[device]?.label ?? (device ? device.toUpperCase() : "DEVICE");
}

export type Seg = { cls: string; text: string; fan?: boolean };

function segClass(ch: string): string {
  if (ch === " ") return "";
  if ("▓▒░".includes(ch)) return "t";
  if (ch === "●") return "l";
  if (ch === "·") return "f";
  if (ch === "¨") return "u";
  if (ch === "┃") return "g";
  if (ch === "═") return "s";
  if (ch === "▪" || ch === "━") return "p";
  if (ch === "▆") return "c";
  if (/[A-Za-z0-9~$]/.test(ch)) return "x";
  return "o";
}

export function artSegments(lines: string[]): Seg[][] {
  let tr = 0;
  return lines.map((line) => {
    const out: Seg[] = [];
    const ch = Array.from(line);
    let cur: string | null = null;
    let buf = "";
    const flush = () => {
      if (!buf) return;
      const text = cur === "f" || cur === "u" ? " ".repeat(buf.length) : buf;
      const cls = !cur || cur === "o" ? "" : `a-${cur}${cur === "t" ? ` tr${tr++ % 4}` : ""}`;
      out.push({ cls, text });
      buf = "";
    };
    for (let i = 0; i < ch.length; i++) {
      if (ch[i] === "─" && ch[i + 1] === "@" && ch[i + 2] === "─") {
        flush();
        cur = null;
        out.push({ cls: "a-fan", text: "─@─", fan: true });
        i += 2;
        continue;
      }
      const c = segClass(ch[i]);
      if (c !== cur) {
        flush();
        cur = c;
      }
      buf += ch[i];
    }
    flush();
    return out;
  });
}

export type ArtState = { cls: string; tag: string; spinning: boolean };

export function artState(d: Display): ArtState {
  const tag =
    d.led === "dim" ? "standby"
    : d.led === "orange" ? "no signal"
    : d.led === "red" ? "ssh auth"
    : d.pulse ? (d.label === "shutting down" ? "halting" : "booting")
    : "live";
  const cls = d.pulse ? "st-boot" : d.led === "dim" ? "st-off" : d.led === "orange" ? "st-lost" : "";
  const spinning = d.led === "green" || d.led === "red" || (d.pulse && d.label === "powering on");
  return { cls, tag, spinning };
}

export type TopoCell = string | { node: string; head: boolean };

export function topology(machines: string[], head: string): TopoCell[][] {
  const workers = machines.filter((m) => m !== head);
  const k = workers.length;
  if (k === 0) return [["╭───╮"], ["│ ", { node: head, head: true }, " │"], ["╰───╯"]];
  const gap = k <= 3 ? (k % 2 ? 3 : 4) : 2;
  const span = (k - 1) * gap + 1;
  const w = Math.max(5, span);
  const off = Math.floor((w - span) / 2);
  const wc = workers.map((_, i) => off + i * gap);
  const hc = Math.floor((w - 1) / 2);
  let r1 = "";
  const r2: TopoCell[] = [];
  for (let c = 0; c < w; c++) {
    const wi = wc.indexOf(c);
    let g = " ";
    if (k === 1) g = c === hc ? "│" : " ";
    else if (c >= wc[0] && c <= wc[k - 1]) {
      if (c === wc[0]) g = "┌";
      else if (c === wc[k - 1]) g = "┐";
      else if (c === hc) g = wi >= 0 ? "┼" : "┴";
      else g = wi >= 0 ? "┬" : "─";
    }
    r1 += g;
    r2.push(wi >= 0 ? { node: workers[wi], head: false } : " ");
  }
  return [[" ".repeat(hc), { node: head, head: true }, " ".repeat(w - hc - 1)], [r1], r2];
}

export const LOGO = "▁▂▄▆█▆▄▂▁\n▀▀▀▀▀▀▀▀▀\n █ █ █ █\n █ █ █ █\n▀▀▀▀▀▀▀▀▀";
export const HOME_FIG = "█ █ █▀█ █▀▄▀█ █▀▀\n█▀█ █▄█ █ ▀ █ ██▄";
export const SETTINGS_FIG = "█▀▀ █▀▀ ▀█▀ ▀█▀ █ █▄ █ █▀▀ █▀▀\n▄▄█ ██▄  █   █  █ █ ▀█ █▄█ ▄▄█";
export const HOUSE_ART = ["    ┌───┐", " ┌──┘ ◉ └──┐", " │ ╭──┴──╮ │", " │ ○ ┌─┐ ● │", " └───┴─┴───┘"];
export const COG = "\u2699\uFE0E";

// Rail icons, in the DGX Spark art's style: the phosphor terminal at ~$ and a stack of Spark chassis.
export const HOME_ICON = [
  "╭────────╮",
  "│ ~$ ▆   │",
  "│        │",
  "╰───┬┬───╯",
  "  ──┴┴──  ",
];
// Not in the rail yet: wired up when the machines page lands.
export const MACHINES_ICON = [
  "   ╭─────╮",
  "  ╭┴────╮│",
  " ╭┴────╮├╯",
  " │▓▒░▒▓├╯ ",
  " ╰───●─╯  ",
];

export const SP_ACT = "▙▛▜▟";
export const SP_MONO = Array.from("⣾⣽⣻⢿⡿⣟⣯⣷");
export const SP_WAIT = Array.from("⠁⠂⠄⡀⢀⠠⠐⠈");
export const FAN = ["─@─", "╲@╲", "│@│", "╱@╱"];
export const AURORA = ["#BF616A", "#D08770", "#EBCB8B", "#A3BE8C", "#B48EAD"];
const WAVE = "▁▂▃▄▅▆▇█";

export function waveStr(t: number): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += WAVE[Math.round(((Math.sin(t * 0.42 - i * 0.78) + 1) / 2) * 7)];
  return s;
}

