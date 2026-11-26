import { describe, expect, it } from "vitest";
import { roundedPerimeter } from "./perimeterGeometry";

describe("rounded perimeter geometry", () => {
  it("preserves square corners and closes the same orbit", () => {
    expect(roundedPerimeter(80, 40, ["0px", "0px", "0px", "0px"], 2))
      .toMatch(/^M 2 2 H 78 .*V 2 L 2 2 Z$/);
  });

  it("reduces overlapping pill radii before insetting the stroke", () => {
    const path = roundedPerimeter(120, 44, Array(4).fill("9999px"), 2);
    expect(path).toBe("M 22 2 H 98 A 20 20 0 0 1 118 22 V 22 A 20 20 0 0 1 98 42 H 22 A 20 20 0 0 1 2 22 V 22 A 20 20 0 0 1 22 2 Z");
  });

  it("uses each elliptical percentage corner and rejects empty surfaces", () => {
    expect(roundedPerimeter(100, 50, ["10% 20%", "0px", "15% 30%", "0px"], 2))
      .toContain("A 13 13 0 0 1 85 48");
    expect(roundedPerimeter(0, 50, Array(4).fill("10px"), 2)).toBe("");
  });
});
