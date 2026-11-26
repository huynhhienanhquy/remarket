import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPerimeterHover } from "./perimeterHover";

describe("delegated perimeter hover", () => {
  let root: HTMLDivElement;
  let perimeter: ReturnType<typeof createPerimeterHover>;

  function enter(selector: string) {
    root.querySelector(selector)?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(120);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(44);
    root = document.createElement("div");
    root.innerHTML = '<div class="rm-card-managed"><span>Product</span><button class="rm-button-primary">Buy</button></div>';
    document.body.append(root);
    perimeter = createPerimeterHover(root);
    root.addEventListener("pointerover", perimeter.enter);
  });

  afterEach(() => {
    perimeter.clear();
    root.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("hands off to a nested button and resumes the same rail on quick reentry", () => {
    enter(".rm-card-managed > span");
    const parentRim = root.querySelector(".rm-perimeter");
    expect(parentRim).toHaveAttribute("data-perimeter-running");
    expect(parentRim?.querySelector(".rm-perimeter-spectrum")).not.toBeNull();
    expect(parentRim?.querySelector("svg")).toBeNull();

    enter("button");
    expect(parentRim).not.toHaveAttribute("data-perimeter-running");
    expect(root.querySelectorAll("[data-perimeter-running]")).toHaveLength(1);
    expect(root.querySelector("button .rm-perimeter")).toHaveAttribute("data-perimeter-variant", "primary");

    enter(".rm-card-managed > span");
    expect(root.querySelector(".rm-perimeter")).toBe(parentRim);
    expect(parentRim).toHaveAttribute("data-perimeter-running");
    perimeter.leave(null);
    expect(parentRim).not.toHaveAttribute("data-perimeter-running");
    vi.advanceTimersByTime(200);
    expect(root.querySelector(".rm-perimeter")).toBeNull();
  });

  it("discards an active rail when its button becomes disabled", async () => {
    enter("button");
    expect(root.querySelector("button .rm-perimeter")).toHaveAttribute("data-perimeter-running");
    const button = root.querySelector("button")!;
    button.disabled = true;
    await Promise.resolve();
    expect(button.querySelector(".rm-perimeter")).toBeNull();
    enter("button");
    expect(root.querySelector(".rm-perimeter")).toBeNull();
  });

  it("builds three feature tracks, one ignition, and a bounded particle line on pointer entry", () => {
    const feature = document.createElement("div");
    feature.className = "rm-card-feature";
    root.append(feature);
    enter(".rm-card-feature");
    const rim = feature.querySelector(".rm-perimeter")!;
    expect(rim.querySelectorAll("g")).toHaveLength(3);
    expect(rim.querySelectorAll(".rm-perimeter-spark")).toHaveLength(1);
    expect(rim.querySelectorAll(".rm-perimeter-burst")).toHaveLength(1);
    expect(rim.querySelectorAll("path[pathLength='100']")).toHaveLength(10);

    enter(".rm-card-feature");
    expect(feature.querySelector(".rm-perimeter")).toBe(rim);
    expect(root.querySelectorAll("[data-perimeter-running]")).toHaveLength(1);
  });
});
