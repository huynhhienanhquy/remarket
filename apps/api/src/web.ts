import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";

/** Serve the Vite build without turning missing API/assets into HTML responses. */
export function mountWeb(app: express.Express, directory: string): void {
  const root = path.resolve(directory);
  const index = path.join(root, "index.html");
  if (!existsSync(index)) throw new Error("Web build is missing. Run pnpm build before starting with SERVE_WEB=true.");
  const assets = express.static(root, {
    index: false,
    dotfiles: "ignore",
    setHeaders(res, file) {
      res.setHeader("Cache-Control", path.dirname(file) === path.join(root, "assets")
        ? "public, max-age=31536000, immutable" : "no-cache");
    },
  });
  app.use((req, res, next) => {
    if (/^\/(api|health|socket\.io)(\/|$)/.test(req.path)) return next();
    return assets(req, res, next);
  });
  app.get("*", (req, res, next) => {
    if (/^\/(api|health|socket\.io)(\/|$)/.test(req.path) || path.extname(req.path) || !req.accepts("html")) return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(index);
  });
}
