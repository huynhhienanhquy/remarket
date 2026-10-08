import { Router } from "express";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import sharp from "sharp";
import { API_ERROR_CODES } from "@remarket/shared";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { authMiddleware, optionalAuth, requireActive } from "../middleware/auth.js";
import type { AuthRequest } from "../middleware/auth.js";
import { ok } from "../shared/api-response.js";
import { notFound, unauthorized, validationError } from "../shared/errors.js";
import {
  createPrivateStorageUrl,
  createStorageReadUrl,
  deleteStorageObject,
  getLocalStoragePath,
  putStorageObject,
  verifyPrivateStorageUrl,
} from "../services/storage.js";

/**
 * Private upload endpoint (detail-project 16).
 *
 * Express ships no multipart parser and `multer` is not a dependency of this
 * build, so the multipart/form-data body is parsed by hand from the raw
 * request stream: 5 MB hard cap while streaming, magic-byte verification
 * (JPEG/PNG/WebP — never trust the extension or the declared MIME type) and a
 * per-user rate limit of 20 uploads / hour.
 *
 * Objects use `users/{userId}/{purpose}/{uuid}.{ext}` in either local private
 * disk storage or a private Supabase bucket. Reads always pass the guarded
 * `GET /:filename` authorization handler below.
 */

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Multipart framing (boundary + headers + CRLF) rides along with the file. */
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 128 * 1024;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 20;

const purposeSchema = z.enum(["product", "avatar"]);

/* ------------------------------------------------------------------ *
 * Per-user rate limit (in-memory; the process is the only instance here)
 * ------------------------------------------------------------------ */

const uploadStamps = new Map<string, number[]>();

function assertUploadRate(userId: string): void {
  const now = Date.now();
  const recent = (uploadStamps.get(userId) ?? []).filter((at) => now - at < RATE_WINDOW_MS);

  if (recent.length >= RATE_MAX) {
    const oldest = recent[0] ?? now;
    const retryAfter = Math.max(1, Math.ceil((oldest + RATE_WINDOW_MS - now) / 1000));
    throw new AppError(
      API_ERROR_CODES.RATE_LIMITED,
      "Bạn tải lên quá nhanh, vui lòng thử lại sau.",
      429,
      { retry_after: retryAfter },
    );
  }

  recent.push(now);
  if (uploadStamps.size > 5000) {
    for (const [key, stamps] of uploadStamps) {
      if (stamps.every((at) => now - at >= RATE_WINDOW_MS)) uploadStamps.delete(key);
    }
  }
  uploadStamps.set(userId, recent);
}

/* ------------------------------------------------------------------ *
 * Multipart parsing
 * ------------------------------------------------------------------ */

interface MultipartPart {
  name: string;
  filename: string | null;
  contentType: string | null;
  data: Buffer;
}

function boundaryOf(req: Request): string {
  const header = req.headers["content-type"];
  if (typeof header !== "string" || !/^multipart\/form-data/i.test(header)) {
    throw validationError("Yêu cầu phải được gửi dưới dạng multipart/form-data.", {
      file: "Nội dung gửi lên không hợp lệ.",
    });
  }
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(header);
  const boundary = (match?.[1] ?? match?.[2] ?? "").trim();
  if (boundary === "") {
    throw validationError("Multipart body không hợp lệ.", {
      file: "Nội dung gửi lên không hợp lệ.",
    });
  }
  return boundary;
}

/** Reads the raw stream, refusing anything beyond the size cap. */
function readBody(req: Request, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const cleanup = (): void => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      req.off("aborted", onAborted);
    };

    const onData = (chunk: Buffer): void => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        settled = true;
        cleanup();
        // Drain the rest of the socket so the error response can still be sent.
        req.resume();
        reject(validationError("Ảnh vượt quá giới hạn 5 MB.", { file: "Ảnh tối đa 5 MB." }));
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks));
    };

    const onError = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const onAborted = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(validationError("Yêu cầu tải lên bị gián đoạn.", { file: "Tải lên thất bại." }));
    };

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("aborted", onAborted);
  });
}

function parsePartHeaders(headerText: string): Pick<MultipartPart, "name" | "filename" | "contentType"> {
  let name = "";
  let filename: string | null = null;
  let contentType: string | null = null;

  for (const line of headerText.split("\r\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "content-disposition") {
      const nameMatch = /(?:^|;)\s*name="([^"]*)"/i.exec(value);
      if (nameMatch) name = nameMatch[1] ?? "";
      const fileMatch = /;\s*filename="([^"]*)"/i.exec(value);
      if (fileMatch) filename = fileMatch[1] ?? "";
    } else if (key === "content-type") {
      contentType = value;
    }
  }

  return { name, filename, contentType };
}

/** Splits a framed multipart body into its parts (RFC 7578 layout). */
function parseMultipart(body: Buffer, boundary: string): MultipartPart[] {
  const framed = Buffer.concat([Buffer.from("\r\n"), body]);
  const delimiter = Buffer.from(`\r\n--${boundary}`);
  const parts: MultipartPart[] = [];

  let cursor = framed.indexOf(delimiter);
  while (cursor !== -1) {
    const dashStart = cursor + 2; // skip the CRLF that belongs to the delimiter
    const afterBoundary = dashStart + boundary.length + 2; // skip "--"
    const marker = framed.toString("latin1", afterBoundary, afterBoundary + 2);
    if (marker === "--") break; // closing delimiter: no more parts

    const headerStart = afterBoundary + 2; // skip the CRLF after the delimiter
    const headerEnd = framed.indexOf("\r\n\r\n", headerStart);
    if (headerEnd === -1) break;

    const dataStart = headerEnd + 4;
    const next = framed.indexOf(delimiter, dataStart);
    if (next === -1) break;

    const headerText = framed.toString("utf8", headerStart, headerEnd);
    parts.push({ ...parsePartHeaders(headerText), data: framed.subarray(dataStart, next) });
    cursor = next;
  }

  return parts;
}

/** Trustworthy format detection: magic bytes only, never the filename. */
export function detectImageType(data: Buffer): "jpg" | "png" | "webp" | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
  if (
    data.length >= 4 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return "png";
  }
  if (
    data.length >= 12 &&
    data.toString("latin1", 0, 4) === "RIFF" &&
    data.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

function contentTypeOf(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

const router = Router();
// POST authenticates explicitly; GET accepts guests and applies asset-level
// visibility checks for public product/avatar images.

// POST /api/v1/uploads — multipart/form-data with `file` + `purpose`.
router.post(
  "/",
  authMiddleware,
  requireActive,
  asyncHandler(async (req: AuthRequest, res) => {
    const authUser = req.user;
    if (!authUser) throw unauthorized();

    assertUploadRate(authUser.id);

    const boundary = boundaryOf(req);
    const body = await readBody(req, MAX_BODY_BYTES);
    const parts = parseMultipart(body, boundary);

    const filePart = parts.find((part) => part.filename !== null && part.name === "file");
    if (!filePart || filePart.data.length === 0) {
      throw validationError("Thiếu tệp ảnh.", { file: "Vui lòng chọn một ảnh." });
    }
    if (filePart.data.length > MAX_UPLOAD_BYTES) {
      throw validationError("Ảnh vượt quá giới hạn 5 MB.", { file: "Ảnh tối đa 5 MB." });
    }

    const purposePart = parts.find((part) => part.name === "purpose");
    const purposeRaw = purposePart ? purposePart.data.toString("utf8").trim() : "";
    const purpose = purposeSchema.safeParse(purposeRaw);
    if (!purpose.success) {
      throw validationError("Giá trị purpose không hợp lệ.", {
        purpose: "Chỉ chấp nhận product hoặc avatar.",
      });
    }

    const type = detectImageType(filePart.data);
    if (type === null) {
      throw validationError("Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.", {
        file: "Định dạng ảnh không được hỗ trợ.",
      });
    }

    let processed: Buffer;
    try {
      const image = sharp(filePart.data, { failOn: "warning", limitInputPixels: 20_000_000 });
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height || metadata.width * metadata.height > 20_000_000) {
        throw new Error("IMAGE_DIMENSIONS");
      }
      // Re-encoding strips EXIF/GPS/ICC metadata by default; rotate applies the
      // EXIF orientation before that metadata is discarded.
      const oriented = image.rotate();
      processed =
        type === "jpg"
          ? await oriented.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
          : type === "png"
            ? await oriented.png({ compressionLevel: 9 }).toBuffer()
            : await oriented.webp({ quality: 90 }).toBuffer();
    } catch {
      throw validationError("Không thể giải mã ảnh hoặc ảnh vượt quá 20 megapixel.", {
        file: "Tệp ảnh bị lỗi hoặc kích thước ảnh quá lớn.",
      });
    }
    if (processed.length > MAX_UPLOAD_BYTES) {
      throw validationError("Ảnh sau xử lý vượt quá giới hạn 5 MB.", { file: "Ảnh tối đa 5 MB." });
    }

    const id = randomUUID();
    const filename = `${id}.${type}`;
    const storagePath = `users/${authUser.id}/${purpose.data}/${filename}`;

    await putStorageObject(storagePath, processed, contentTypeOf(filename));
    try {
      await prisma.uploadAsset.create({
        data: {
          userId: authUser.id,
          purpose: purpose.data,
          storagePath,
          mimeType: contentTypeOf(filename),
          byteSize: processed.length,
        },
      });
    } catch (error) {
      await deleteStorageObject(storagePath).catch(() => undefined);
      throw error;
    }

    ok(res, { storage_path: storagePath, url: createPrivateStorageUrl(storagePath) }, 201);
  }),
);

// GET /api/v1/uploads/:filename — authorize the resource first, then either
// stream local bytes or redirect to a five-minute Supabase signed URL.
router.get(
  "/:filename",
  optionalAuth,
  asyncHandler(async (req: AuthRequest, res, next) => {
    const filename = req.params.filename;
    if (
      typeof filename !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(filename) ||
      filename.includes("..")
    ) {
      throw notFound("Không tìm thấy tệp.");
    }

    const asset = await prisma.uploadAsset.findFirst({
      where: { storagePath: { endsWith: `/${filename}` } },
      include: {
        user: { select: { status: true, emailVerifiedAt: true } },
        product: {
          select: {
            sellerId: true,
            status: true,
            isBlocked: true,
            deletedAt: true,
            seller: { select: { status: true, emailVerifiedAt: true } },
            category: {
              select: {
                status: true,
                parent: { select: { status: true } },
                _count: { select: { children: true } },
              },
            },
          },
        },
      },
    });
    if (!asset) throw notFound("Không tìm thấy tệp.");

    const isOwner = req.user?.id === asset.userId;
    const isAdmin = req.user?.role === "ADMIN";
    const hasValidPreviewSignature = verifyPrivateStorageUrl(
      asset.storagePath,
      req.query.expires,
      req.query.signature,
    );
    const publicAvatar =
      asset.purpose === "avatar" &&
      asset.attachedAt !== null &&
      asset.user.status === "ACTIVE" &&
      asset.user.emailVerifiedAt !== null;
    const publicProduct =
      asset.purpose === "product" &&
      asset.attachedAt !== null &&
      asset.product !== null &&
      asset.product.deletedAt === null &&
      !asset.product.isBlocked &&
      ["ACTIVE", "RESERVED", "SOLD"].includes(asset.product.status) &&
      asset.product.seller.status === "ACTIVE" &&
      asset.product.seller.emailVerifiedAt !== null &&
      asset.product.category.status === "ACTIVE" &&
      (asset.product.category.parent === null || asset.product.category.parent.status === "ACTIVE") &&
      asset.product.category._count.children === 0;
    const orderParticipant = req.user
      ? await prisma.orderItem.findFirst({
          where: {
            OR: [
              { imagePathSnapshot: asset.storagePath },
              { imageUrl: `/api/v1/uploads/${filename}` },
            ],
            order: { OR: [{ buyerId: req.user.id }, { sellerId: req.user.id }] },
          },
          select: { id: true },
        })
      : null;
    if (
      !isOwner &&
      !isAdmin &&
      !hasValidPreviewSignature &&
      !publicAvatar &&
      !publicProduct &&
      !orderParticipant
    ) {
      throw notFound("Không tìm thấy tệp.");
    }

    res.setHeader("Cache-Control", "private, max-age=300");
    const signedUrl = await createStorageReadUrl(asset.storagePath);
    if (signedUrl) {
      res.redirect(302, signedUrl);
      return;
    }

    res.setHeader("Content-Type", asset.mimeType);
    res.sendFile(getLocalStoragePath(asset.storagePath), (error) => {
      if (error && !res.headersSent) next(error);
    });
  }),
);

export { router as uploadsRouter };
