import { roundedPerimeter } from "./perimeterGeometry";

const SVG_NS = "http://www.w3.org/2000/svg";
const UNAVAILABLE = ':disabled, [aria-disabled="true"], [aria-busy="true"], [inert]';
const OVERLAY = '[aria-modal="true"], [role="menu"], [data-copilot-popup]';
const PANELS = ".rm-card-panel, .rm-account-card:not(.rm-card-face), .admin-panel:not(.dashboard-kpi), .rm-account-heading";
const ACTIONS = ".rm-card-action, .rm-table-action";
const NAV = 'nav a[href], nav button, [role="tab"], [role="menuitem"], .rm-nav-link, .category-tree-item';
export const ICON_HITS = '.rm-icon-heart, .admin-header-tool, button[aria-label]:has(> svg), .rm-control[aria-label]:has(> svg)';
const CARDS = `${ACTIONS}, .rm-card-link, .rm-card-feature, .rm-card-tile, .rm-card-nav, .rm-card-managed, .rm-dashboard-card, .admin-metric, ${PANELS}`;
const CONTROLS = 'button, summary, [role="button"], .rm-button, .rm-button-primary, .rm-button-secondary, .rm-control, .admin-utility, .admin-header-tool';
const HIT_AREAS = `${CARDS}, ${CONTROLS}, ${NAV}, a[href], input, select, textarea, label:has(input)`;
const DANGER = '.rm-button-danger, .bg-danger, .text-danger, [class~="!text-danger"], [data-tone="danger"]';
const EXIT_MS = 190;
const QUIET_RIMS = new Set(["list", "navigation", "action", "panel"]);
const SPECTRUM_RIMS = new Set(["feature", "primary", "dashboard", "icon", "product"]);
const COUNTER_RIMS = new Set(["feature", "dual", "primary", "dashboard"]);
const PARTICLE_RIMS = new Set(["feature", "dual", "primary", "icon", "statistics"]);

function variantFor(hit: HTMLElement) {
  if (hit.matches(".rm-card-feature")) return "feature";
  if (hit.matches(".rm-card-tile")) return "dual";
  if (hit.matches(".rm-dashboard-card")) return "dashboard";
  if (hit.matches(".admin-metric")) return "statistics";
  if (hit.matches(".rm-card-link, .rm-card-managed")) return "product";
  if (hit.matches(ACTIONS)) return "list";
  if (hit.matches(".rm-fab")) return "floating";
  if (hit.matches(DANGER)) return "danger";
  if (hit.matches(".rm-button-primary, .admin-primary")) return "primary";
  if (hit.matches(".rm-button-secondary")) return "secondary";
  if (hit.matches(ICON_HITS)) return "icon";
  if (hit.matches(`${NAV}, .rm-card-nav`)) return "navigation";
  if (hit.matches(PANELS)) return "panel";
  if (!hit.matches(CONTROLS)) return null;
  return (hit.hasAttribute("aria-label") && !hit.textContent?.trim() && hit.querySelector("svg"))
    ? "icon" : "action";
}

type Rim = {
  hit: HTMLElement;
  surface: HTMLElement;
  layer: HTMLSpanElement;
  svg?: SVGSVGElement;
  paths: SVGPathElement[];
};

function paint({ surface, layer, svg, paths }: Rim) {
  const width = surface.offsetWidth;
  const height = surface.offsetHeight;
  const style = getComputedStyle(surface);
  const corners = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius];
  if (width <= 4 || height <= 4) return false;

  layer.style.left = `-${style.borderLeftWidth || "0px"}`;
  layer.style.top = `-${style.borderTopWidth || "0px"}`;
  layer.style.width = `calc(100% + ${style.borderLeftWidth || "0px"} + ${style.borderRightWidth || "0px"})`;
  layer.style.height = `calc(100% + ${style.borderTopWidth || "0px"} + ${style.borderBottomWidth || "0px"})`;
  corners.forEach((value, index) => {
    layer.style.setProperty(["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"][index]!, value);
  });
  if (layer.querySelector(".rm-perimeter-spectrum")) {
    layer.style.setProperty("--rm-perimeter-spectrum-size", `${Math.ceil(Math.hypot(width, height)) + 2}px`);
  }
  if (svg) {
    const d = roundedPerimeter(width, height, corners, 2);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    paths.forEach((path) => path.setAttribute("d", d));
  }
  return true;
}

function addStroke(parent: SVGElement, paths: SVGPathElement[], part: string) {
  const path = document.createElementNS(SVG_NS, "path");
  path.classList.add(`rm-perimeter-${part}`);
  path.setAttribute("pathLength", "100");
  paths.push(path);
  parent.append(path);
}

function makeTrails(variant: string, paths: SVGPathElement[]) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("preserveAspectRatio", "none");
  const tracks = ["forward"];
  if (COUNTER_RIMS.has(variant)) tracks.push("reverse");
  if (variant === "feature") tracks.push("echo");
  for (const track of tracks) {
    const trail = document.createElementNS(SVG_NS, "g");
    trail.classList.add(`rm-perimeter-${track}`);
    const layered = track === "forward" && !QUIET_RIMS.has(variant);
    for (const part of layered ? ["bloom", "tail", "body", "head"] : ["tail", "head"]) {
      addStroke(trail, paths, part);
    }
    svg.append(trail);
  }
  if (PARTICLE_RIMS.has(variant)) addStroke(svg, paths, "spark");
  addStroke(svg, paths, "burst");
  return svg;
}

function makeRim(hit: HTMLElement, variant: string): Rim | null {
  const surface = hit.querySelector<HTMLElement>(":scope > :is(.rm-card-face, .rm-card-preview-face, .dashboard-kpi)") ?? hit;
  // A table row's decorative content belongs inside a cell, even though its
  // positioning and geometry belong to the row.
  const mount = surface instanceof HTMLTableRowElement ? surface.cells.item(0) : surface;
  if (!mount) return null;

  const layer = document.createElement("span");
  layer.className = "rm-perimeter";
  layer.setAttribute("aria-hidden", "true");
  layer.dataset.perimeterVariant = variant;
  if (SPECTRUM_RIMS.has(variant)) {
    const spectrum = document.createElement("span");
    spectrum.className = "rm-perimeter-spectrum";
    layer.append(spectrum);
  }
  const paths: SVGPathElement[] = [];
  // Dense grids keep a fixed mask and animate the inner layer's transform.
  const svg = variant === "product" ? undefined : makeTrails(variant, paths);
  if (svg) layer.append(svg);
  const rim = { hit, surface, layer, svg, paths };
  if (!paint(rim)) return null;
  if (getComputedStyle(surface).position === "static") surface.dataset.perimeterHost = "";
  mount.append(layer);
  return rim;
}

function alignEntry(rim: Rim, x: number, y: number) {
  const bounds = rim.hit.getBoundingClientRect();
  const { width, height } = bounds;
  const px = Math.min(width, Math.max(0, x - bounds.left));
  const py = Math.min(height, Math.max(0, y - bounds.top));
  const distances = [py, width - px, height - py, px];
  const offsets = [px, width + py, 2 * width + height - px, 2 * (width + height) - py];
  const edge = distances.indexOf(Math.min(...distances));
  const phase = (offsets[edge] ?? 0) / Math.max(1, 2 * (width + height));
  const angle = Math.atan2(px - width / 2, height / 2 - py);
  rim.layer.style.setProperty("--rm-perimeter-burst-offset", `${-phase * 100}px`);
  rim.layer.style.setProperty("--rm-perimeter-rotation", `${angle}rad`);
  if (rim.layer.matches('[data-perimeter-variant="list"], [data-perimeter-variant="navigation"]')) {
    rim.layer.style.setProperty("--rm-perimeter-entry", `${-phase * 100}px`);
  }
}

/** One running decoration and one fading decoration for the entire application. */
export function createPerimeterHover(root: HTMLElement) {
  let active: Rim | null = null;
  let fading: Rim | null = null;
  let exitTimer = 0;

  const mutations = new MutationObserver((records) => {
    if (!active) return;
    const { hit, layer } = active;
    if (!root.contains(hit) || !root.contains(layer) || hit.closest(UNAVAILABLE) ||
      records.some((record) => Array.from(record.addedNodes).some((node) =>
        node instanceof Element && !node.contains(hit) && (node.matches(OVERLAY) || node.querySelector(OVERLAY)),
      ))) clear();
  });
  const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
    if (active && !paint(active)) clear();
  }) : null;

  function remove(rim: Rim) {
    rim.layer.remove();
    if (!rim.surface.querySelector(".rm-perimeter")) delete rim.surface.dataset.perimeterHost;
  }

  function discardFade() {
    if (exitTimer) window.clearTimeout(exitTimer);
    exitTimer = 0;
    if (fading) remove(fading);
    fading = null;
  }

  function stop(fade: boolean) {
    if (!active) return;
    mutations.disconnect();
    resize?.disconnect();
    const rim = active;
    active = null;
    if (!fade) {
      remove(rim);
      return;
    }
    discardFade();
    delete rim.layer.dataset.perimeterRunning;
    fading = rim;
    exitTimer = window.setTimeout(discardFade, EXIT_MS);
  }

  function clear() {
    stop(false);
    discardFade();
  }

  function hitAt(node: EventTarget | null) {
    if (!(node instanceof Element)) return null;
    const hit = node.closest<HTMLElement>(HIT_AREAS);
    return hit && root.contains(hit) && !hit.closest(UNAVAILABLE) ? hit : null;
  }

  function enter(event: PointerEvent) {
    const hit = hitAt(event.target);
    if (hit === active?.hit) return;
    const variant = hit && variantFor(hit);
    if (hit && variant && fading?.hit === hit && root.contains(fading.layer)) {
      stop(false);
      window.clearTimeout(exitTimer);
      exitTimer = 0;
      active = fading;
      fading = null;
    } else {
      stop(true);
      if (!hit || !variant) return;
      active = makeRim(hit, variant);
      if (active) alignEntry(active, event.clientX, event.clientY);
    }
    if (!active) return;
    active.layer.dataset.perimeterRunning = "";
    mutations.observe(root, { childList: true, subtree: true });
    mutations.observe(active.hit, { attributes: true, attributeFilter: ["disabled", "aria-disabled", "aria-busy", "inert"] });
    resize?.observe(active.surface);
  }

  function leave(next: EventTarget | null) {
    if (active && active.hit !== hitAt(next)) stop(true);
  }

  return { enter, leave, clear };
}
