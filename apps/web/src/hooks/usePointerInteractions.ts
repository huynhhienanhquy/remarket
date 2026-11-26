import { useEffect } from "react";
import { createPerimeterHover, ICON_HITS } from "./perimeterHover";

const POINTER_MEDIA = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
const DIRECTIONAL = ".rm-card-action, .rm-table-action";
const TRACKED = `${DIRECTIONAL}, .rm-card-tile, .rm-card-feature, .rm-button-primary, .rm-button-secondary, .admin-primary, ${ICON_HITS}`;
const HIT_AREAS = `${TRACKED}, button, a[href], input, select, textarea, summary, [role="button"]`;
const UNAVAILABLE = ':disabled, [aria-disabled="true"], [aria-busy="true"]';
const OVERLAY = '[aria-modal="true"], [role="menu"], [data-copilot-popup]';
const ACTIVE = "data-pointer-active";
const SIDE = "data-pointer-side";
const X = "--rm-pointer-x";
const Y = "--rm-pointer-y";
const LIGHT_X = "--rm-light-x";
const LIGHT_Y = "--rm-light-y";

const DAMPING = 18;
const FREQUENCY = 16;

function spring(value: number) {
  return { value, target: value, velocity: 0 };
}

function advance(axis: ReturnType<typeof spring>, seconds: number) {
  if (axis.value === axis.target && axis.velocity === 0) return false;

  // Analytic damped spring. The same motion works at different refresh rates.
  const distance = axis.value - axis.target;
  const decay = Math.exp(-DAMPING * seconds);
  const phase = FREQUENCY * seconds;
  const sine = Math.sin(phase);
  const cosine = Math.cos(phase);
  const wave = (axis.velocity + DAMPING * distance) / FREQUENCY;
  const offset = decay * (distance * cosine + wave * sine);
  axis.velocity = decay * FREQUENCY * (wave * cosine - distance * sine) - DAMPING * offset;
  axis.value = axis.target + offset;

  if (Math.abs(offset) < 0.002 && Math.abs(axis.velocity) < 0.025) {
    axis.value = axis.target;
    axis.velocity = 0;
    return false;
  }
  return true;
}

function coordinate(position: number, start: number, size: number) {
  return Math.max(-1, Math.min(1, (position - start) / size * 2 - 1));
}

/** Drive only the surface under the pointer. Visual layers never move the hit area. */
export function usePointerInteractions(rootId: string) {
  useEffect(() => {
    const container = document.getElementById(rootId);
    if (!container || typeof window.matchMedia !== "function") return;

    const root = container;
    const media = window.matchMedia(POINTER_MEDIA);
    const perimeter = createPerimeterHover(root);
    let active: {
      hit: HTMLElement;
      directional: boolean;
      x: ReturnType<typeof spring>;
      y: ReturnType<typeof spring>;
      width: number;
      height: number;
    } | null = null;
    let latest: { hit: HTMLElement; clientX: number; clientY: number } | null = null;
    let frame = 0;
    let lastTime: number | null = null;

    // While a surface is active, also catch DOM replacement and state changes
    // that can occur without a new mouse event.
    const observer = new MutationObserver((records) => {
      const hit = active?.hit;
      if (!hit) return;
      if (!root.contains(hit) || hit.matches(UNAVAILABLE) || records.some((record) =>
        Array.from(record.addedNodes).some((node) => node instanceof Element &&
          !node.contains(hit) && (node.matches(OVERLAY) || node.querySelector(OVERLAY))),
      )) reset();
    });

    function deactivate() {
      if (!active) return;
      const { hit } = active;
      observer.disconnect();
      hit.removeAttribute(ACTIVE);
      hit.removeAttribute(SIDE);
      for (const property of [X, Y, LIGHT_X, LIGHT_Y]) hit.style.removeProperty(property);
      active = null;
    }

    function reset() {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      lastTime = null;
      latest = null;
      deactivate();
    }

    function clearHover() {
      reset();
      perimeter.clear();
    }

    function sample({ hit, clientX, clientY }: NonNullable<typeof latest>) {
      if (!root.contains(hit) || hit.matches(UNAVAILABLE)) {
        deactivate();
        return;
      }

      // Only an input sample needs geometry. Settling frames only write styles.
      const bounds = hit.getBoundingClientRect();
      if (
        !bounds.width || !bounds.height ||
        clientX < bounds.left || clientX >= bounds.right ||
        clientY < bounds.top || clientY >= bounds.bottom
      ) {
        deactivate();
        return;
      }

      const x = coordinate(clientX, bounds.left, bounds.width);
      const y = coordinate(clientY, bounds.top, bounds.height);
      if (active?.hit !== hit) {
        deactivate();
        const directional = hit.matches(DIRECTIONAL);
        active = { hit, directional, x: spring(x), y: spring(y), width: bounds.width, height: bounds.height };
        if (directional) {
          const side = Math.abs(x) > Math.abs(y) ? (x < 0 ? "left" : "right") : (y < 0 ? "top" : "bottom");
          hit.setAttribute(SIDE, side);
        }
        hit.setAttribute(ACTIVE, "");
        observer.observe(root, { childList: true, subtree: true });
        observer.observe(hit, { attributeFilter: ["disabled", "aria-disabled", "aria-busy"] });
        return;
      }

      active.x.target = x;
      active.y.target = y;
      active.width = bounds.width;
      active.height = bounds.height;
    }

    function update(time: number) {
      frame = 0;
      const event = latest;
      latest = null;
      if (event) sample(event);
      if (!active || active.directional) return;

      const { hit, x, y, width, height } = active;
      if (!root.contains(hit) || hit.matches(UNAVAILABLE)) {
        deactivate();
        return;
      }

      const seconds = lastTime === null ? 1 / 60 : Math.max(0, (time - lastTime) / 1000);
      const movingX = advance(x, seconds);
      const movingY = advance(y, seconds);
      hit.style.setProperty(X, x.value.toFixed(3));
      hit.style.setProperty(Y, y.value.toFixed(3));
      hit.style.setProperty(LIGHT_X, `${(x.value * width * .5).toFixed(1)}px`);
      hit.style.setProperty(LIGHT_Y, `${(y.value * height * .5).toFixed(1)}px`);
      lastTime = movingX || movingY ? time : null;
      if (lastTime !== null) frame = window.requestAnimationFrame(update);
    }

    function hitArea(node: EventTarget | null) {
      if (!(node instanceof Element)) return null;
      const hit = node.closest<HTMLElement>(HIT_AREAS);
      return hit?.matches(TRACKED) && root.contains(hit) ? hit : null;
    }

    function track(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      const hit = hitArea(event.target);
      if (!hit || hit.matches(UNAVAILABLE)) {
        if (active || latest) reset();
        return;
      }
      if (active?.hit === hit && active.directional) return;
      latest = { hit, clientX: event.clientX, clientY: event.clientY };
      if (!frame) frame = window.requestAnimationFrame(update);
    }

    function leave(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      perimeter.leave(event.relatedTarget);
      const hit = latest?.hit ?? active?.hit;
      if (hit && hit !== hitArea(event.relatedTarget)) reset();
    }

    function enter(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      perimeter.enter(event);
      track(event);
    }

    function listen() {
      // Media changes also clear any queued frame and inline coordinates.
      unlisten();
      if (!media.matches) return;
      root.addEventListener("pointerover", enter, { passive: true });
      root.addEventListener("pointermove", track, { passive: true });
      root.addEventListener("pointerout", leave, { passive: true });
      root.addEventListener("pointerleave", clearHover);
      root.addEventListener("pointercancel", clearHover);
      window.addEventListener("blur", clearHover);
      window.addEventListener("resize", reset);
      window.addEventListener("scroll", reset, { capture: true, passive: true });
      window.addEventListener("popstate", clearHover);
    }

    function unlisten() {
      clearHover();
      root.removeEventListener("pointerover", enter);
      root.removeEventListener("pointermove", track);
      root.removeEventListener("pointerout", leave);
      root.removeEventListener("pointerleave", clearHover);
      root.removeEventListener("pointercancel", clearHover);
      window.removeEventListener("blur", clearHover);
      window.removeEventListener("resize", reset);
      window.removeEventListener("scroll", reset, true);
      window.removeEventListener("popstate", clearHover);
    }

    listen();
    media.addEventListener("change", listen);
    return () => {
      media.removeEventListener("change", listen);
      unlisten();
    };
  }, [rootId]);
}
