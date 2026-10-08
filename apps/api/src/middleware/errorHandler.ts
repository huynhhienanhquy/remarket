import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { API_ERROR_CODES } from "@remarket/shared";
import { envelopeMeta } from "../shared/api-response.js";

/**
 * Error envelope (detail-project 4/17). Nothing leaves this handler as a
 * stack trace, SQL fragment, Prisma class name or token.
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Compact correlated log line: message only, never payloads or stack data. */
function log(error: Error, requestId: string): void {
  const message = error.message.replace(/[\r\n]+/g, " ").slice(0, 1_000);
  const line = `[${new Date().toISOString()}] request_id=${requestId} ${error.name}: ${message}`;
  const parserError = error as Error & { status?: number };
  if (
    (error instanceof AppError && error.status < 500) ||
    error instanceof ZodError ||
    (parserError.status !== undefined && parserError.status >= 400 && parserError.status < 500)
  ) {
    console.warn(line);
    return;
  }
  console.error(line);
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): Response | void {
  if (res.headersSent) return;

  const requestId =
    typeof res.locals.requestId === "string" && res.locals.requestId !== ""
      ? res.locals.requestId
      : "unknown";
  log(err, requestId);

  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
      meta: envelopeMeta(res),
    });
  }

  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const path = issue.path.join(".") || "_";
      if (!fields[path]) fields[path] = issue.message;
    }
    return res.status(422).json({
      success: false,
      error: {
        code: API_ERROR_CODES.VALIDATION_ERROR,
        message: "Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.",
        details: { fields },
      },
      meta: envelopeMeta(res),
    });
  }

  const parserError = err as Error & { status?: number; type?: string };
  if (parserError.status === 413 || parserError.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error: {
        code: API_ERROR_CODES.VALIDATION_ERROR,
        message: "Dữ liệu gửi lên vượt quá giới hạn cho phép.",
      },
      meta: envelopeMeta(res),
    });
  }
  if (parserError.status === 400 && parserError.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      error: {
        code: API_ERROR_CODES.VALIDATION_ERROR,
        message: "Nội dung JSON không hợp lệ.",
      },
      meta: envelopeMeta(res),
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = Array.isArray(err.meta?.target)
        ? (err.meta.target as string[]).join(", ")
        : "Trường dữ liệu";
      return res.status(409).json({
        success: false,
        error: {
          code: API_ERROR_CODES.VALIDATION_ERROR,
          message: `${target} đã được sử dụng. Vui lòng chọn giá trị khác.`,
          details: { fields: { [target]: "Giá trị đã tồn tại." } },
        },
        meta: envelopeMeta(res),
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({
        success: false,
        error: { code: API_ERROR_CODES.NOT_FOUND, message: "Không tìm thấy nội dung này." },
        meta: envelopeMeta(res),
      });
    }
    if (err.code === "P2003") {
      return res.status(422).json({
        success: false,
        error: {
          code: API_ERROR_CODES.VALIDATION_ERROR,
          message: "Dữ liệu liên kết không tồn tại.",
        },
        meta: envelopeMeta(res),
      });
    }
    if (err.code === "P2034" || err.code === "P2028") {
      return res.status(409).json({
        success: false,
        error: {
          code: API_ERROR_CODES.RETRY_LATER,
          message: err.code === "P2028"
            ? "Máy chủ xử lý quá lâu. Vui lòng thử lại."
            : "Dữ liệu vừa được cập nhật bởi thao tác khác, vui lòng thử lại.",
        },
        meta: envelopeMeta(res),
      });
    }
  }

  return res.status(500).json({
    success: false,
    error: {
      code: API_ERROR_CODES.INTERNAL,
      message: "Đã có lỗi xảy ra. Vui lòng thử lại sau.",
    },
    meta: envelopeMeta(res),
  });
}

/** Wraps an async handler so rejections reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
