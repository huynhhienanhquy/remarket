/**
 * Deterministic SVG placeholders for fixture images (ui-spec 27: unlabeled
 * stock photos must never imply a specific item). Each placeholder names what
 * it stands in for and is generated locally, so no network image is fetched.
 */

const PALETTE = [
  "#E8F3EC",
  "#ECF3FF",
  "#FFF4DA",
  "#F0F3EE",
  "#FEF0EE",
  "#E7EEF6",
] as const;

const INK = "#17251D";

function hash(value: string): number {
  let result = 0;
  for (let i = 0; i < value.length; i += 1) {
    result = (result * 31 + value.charCodeAt(i)) >>> 0;
  }
  return result;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(label: string, maxPerLine: number): string[] {
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current === "") {
      current = word;
    } else if (`${current} ${word}`.length <= maxPerLine) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
    if (lines.length === 2) break;
  }
  if (current && lines.length < 2) lines.push(current);
  return lines.slice(0, 2);
}

/**
 * Returns a data-URI image. `label` should be the product title (or a short
 * description for avatars); `caption` is printed under it.
 */
export function placeholderImage(label: string, caption = "Ảnh minh họa"): string {
  const background = PALETTE[hash(label) % PALETTE.length];
  const lines = wrapText(label, 22);
  const text = lines
    .map(
      (line, index) =>
        `<text x="400" y="${index === 0 ? 300 : 344}" font-family="system-ui, sans-serif" font-size="30" font-weight="600" fill="${INK}" text-anchor="middle">${escapeXml(line)}</text>`,
    )
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600" role="img" aria-label="${escapeXml(label)}">
<rect width="800" height="600" fill="${background}"/>
<rect x="24" y="24" width="752" height="552" fill="none" stroke="#DDE4DC" stroke-width="2"/>
${text}
<text x="400" y="420" font-family="system-ui, sans-serif" font-size="20" fill="#56645B" text-anchor="middle">${escapeXml(caption)}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Square avatar placeholder with initials (no user photos in fixtures). */
export function avatarPlaceholder(name: string): string {
  const initials = name
    .split(/\s+/)
    .slice(-2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  const background = PALETTE[hash(name) % PALETTE.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="${escapeXml(name)}">
<rect width="160" height="160" fill="${background}"/>
<text x="80" y="96" font-family="system-ui, sans-serif" font-size="56" font-weight="600" fill="${INK}" text-anchor="middle">${escapeXml(initials)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
