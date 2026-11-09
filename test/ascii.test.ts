import { describe, expect, it } from "vitest";
import { artSegments, deviceArt, deviceLabel, DEVICES, topology } from "../app/ascii";

describe("ascii", () => {
  it("falls back to the generic box for unknown devices", () => {
    expect(deviceArt("jetson-orin")).not.toBe(DEVICES["dgx-spark"].art);
    expect(deviceArt("jetson-orin")[0]).toMatch(/^╭─+╮$/);
    expect(deviceLabel("rtx6000")).toBe("RTX PRO 6000");
    expect(deviceLabel("jetson-orin")).toBe("JETSON-ORIN");
  });

  it("keeps every art row's text intact and marks the RTX fans", () => {
    for (const device of [...Object.keys(DEVICES), "x"]) {
      const lines = deviceArt(device);
      const text = artSegments(lines).map((segs) => segs.map((s) => s.text).join(""));
      expect(text.map((l) => [...l].length)).toEqual(lines.map((l) => [...l].length));
    }
    expect(artSegments(deviceArt("rtx6000")).flat().filter((s) => s.fan)).toHaveLength(2);
  });

  it("wires the head to every worker", () => {
    const rows = topology(["a", "b", "c", "d"], "a");
    const nodes = rows.flat().filter((c) => typeof c !== "string");
    expect(nodes).toEqual([{ node: "a", head: true }, { node: "b", head: false }, { node: "c", head: false }, { node: "d", head: false }]);
    expect(rows[1].join("")).toBe("┌──┼──┐");
  });
});
