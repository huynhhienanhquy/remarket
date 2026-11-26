type Radius = { x: number; y: number };

function radius(value: string, width: number, height: number): Radius {
  const [horizontal = "0", vertical = horizontal] = value.split(/\s+/);
  const resolve = (part: string, size: number) =>
    (Number.parseFloat(part) || 0) * (part.endsWith("%") ? size / 100 : 1);
  return { x: resolve(horizontal, width), y: resolve(vertical, height) };
}

/** Follow CSS's proportional reduction of overlapping corner radii, including pills. */
export function roundedPerimeter(width: number, height: number, cornerValues: readonly string[], inset: number) {
  const [tl, tr, br, bl] = cornerValues.map((value) => radius(value, width, height));
  if (!tl || !tr || !br || !bl || width <= inset * 2 || height <= inset * 2) return "";

  const fit = Math.min(1,
    width / (tl.x + tr.x), width / (bl.x + br.x),
    height / (tl.y + bl.y), height / (tr.y + br.y),
  );
  for (const corner of [tl, tr, br, bl]) {
    corner.x = Math.max(0, corner.x * fit - inset);
    corner.y = Math.max(0, corner.y * fit - inset);
    if (!corner.x || !corner.y) corner.x = corner.y = 0;
  }

  const near = inset;
  const right = width - inset;
  const bottom = height - inset;
  const arc = (corner: Radius, x: number, y: number) => corner.x && corner.y
    ? `A ${corner.x} ${corner.y} 0 0 1 ${x} ${y}`
    : `L ${x} ${y}`;

  return [
    `M ${near + tl.x} ${near}`,
    `H ${right - tr.x}`, arc(tr, right, near + tr.y),
    `V ${bottom - br.y}`, arc(br, right - br.x, bottom),
    `H ${near + bl.x}`, arc(bl, near, bottom - bl.y),
    `V ${near + tl.y}`, arc(tl, near + tl.x, near),
    "Z",
  ].join(" ");
}
