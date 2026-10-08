import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { ZodError, z } from "zod";
import { API_ERROR_CODES } from "@remarket/shared";
import type { AuthUser } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { env } from "../config/env.js";
import { assertConversationParticipant, markConversationRead, sendChatMessage } from "../services/chat-service.js";
import { toMessage } from "../shared/dto-mappers.js";
import { verifyAccessToken } from "../shared/tokens.js";
import { prisma } from "../utils/prisma.js";
import { onRealtimeEvent } from "./events.js";

interface SocketIdentity {
  user: AuthUser;
  sessionId: string;
}

const joinSchema = z.object({ conversation_id: z.string().uuid() }).strict();
const sendSchema = z.object({
  conversation_id: z.string().uuid(),
  client_message_id: z.string().trim().min(1).max(100),
  content: z.string().trim().min(1).max(2000),
}).strict();
const readSchema = z.object({
  conversation_id: z.string().uuid(),
  last_message_id: z.string().uuid(),
}).strict();

const SOCKET_MESSAGE_WINDOW_MS = 60_000;
const SOCKET_MESSAGE_LIMIT = 30;
const socketMessageWindows = new Map<string, { startedAt: number; count: number }>();

function assertSocketMessageRateLimit(userId: string): void {
  const now = Date.now();
  const current = socketMessageWindows.get(userId);
  if (!current || now - current.startedAt >= SOCKET_MESSAGE_WINDOW_MS) {
    socketMessageWindows.set(userId, { startedAt: now, count: 1 });
    return;
  }
  if (current.count >= SOCKET_MESSAGE_LIMIT) {
    throw new AppError(
      API_ERROR_CODES.RATE_LIMITED,
      "Bạn thao tác quá nhanh, vui lòng thử lại sau.",
      429,
    );
  }
  current.count += 1;

  // Opportunistic cleanup keeps the process-local limiter bounded without a
  // timer that would retain idle user ids indefinitely.
  if (socketMessageWindows.size > 10_000) {
    for (const [id, window] of socketMessageWindows) {
      if (now - window.startedAt >= SOCKET_MESSAGE_WINDOW_MS) socketMessageWindows.delete(id);
    }
  }
}

function handshakeToken(socket: { handshake: { auth: Record<string, unknown>; headers: Record<string, unknown> } }): string | null {
  const authToken = socket.handshake.auth.token;
  if (typeof authToken === "string" && authToken.trim()) return authToken.trim();
  const header = socket.handshake.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

async function identityFromToken(token: string): Promise<SocketIdentity | null> {
  const claims = verifyAccessToken(token);
  if (!claims) return null;
  const session = await prisma.session.findUnique({
    where: { id: claims.sessionId },
    include: { user: true },
  });
  if (
    !session ||
    session.userId !== claims.userId ||
    session.revokedAt !== null ||
    session.expiresAt <= new Date()
  ) return null;
  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
      role: session.user.role,
      status: session.user.status,
      emailVerifiedAt: session.user.emailVerifiedAt,
    },
  };
}

async function refreshIdentity(identity: SocketIdentity): Promise<SocketIdentity | null> {
  const session = await prisma.session.findUnique({
    where: { id: identity.sessionId },
    include: { user: true },
  });
  if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) return null;
  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
      role: session.user.role,
      status: session.user.status,
      emailVerifiedAt: session.user.emailVerifiedAt,
    },
  };
}

function socketError(error: unknown): { ok: false; error: { code: string; message: string } } {
  if (error instanceof AppError) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  if (error instanceof ZodError) {
    return {
      ok: false,
      error: {
        code: API_ERROR_CODES.VALIDATION_ERROR,
        message: "Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.",
      },
    };
  }
  return {
    ok: false,
    error: {
      code: API_ERROR_CODES.INTERNAL,
      message: "Có lỗi xảy ra.",
    },
  };
}

export function attachRealtime(server: HttpServer): { close: () => Promise<void> } {
  const io = new Server(server, {
    path: "/socket.io",
    cors: { origin: env.corsOrigins, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = handshakeToken(socket);
      const identity = token ? await identityFromToken(token) : null;
      if (!identity) return next(new Error("UNAUTHORIZED"));
      socket.data.identity = identity;
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    const initial = socket.data.identity as SocketIdentity;
    void socket.join(`user:${initial.user.id}`);
    void socket.join(`session:${initial.sessionId}`);

    async function liveIdentity(): Promise<SocketIdentity> {
      const current = await refreshIdentity(socket.data.identity as SocketIdentity);
      if (!current) {
        socket.disconnect(true);
        throw new AppError(API_ERROR_CODES.SESSION_EXPIRED, "Phiên đăng nhập đã hết hạn.", 401);
      }
      socket.data.identity = current;
      return current;
    }

    socket.on("conversation:join", async (raw, ack = () => undefined) => {
      try {
        const input = joinSchema.parse(raw);
        const identity = await liveIdentity();
        await assertConversationParticipant(input.conversation_id, identity.user.id);
        await socket.join(`conversation:${input.conversation_id}`);
        ack({ ok: true });
      } catch (error) {
        ack(socketError(error));
      }
    });

    socket.on("message:send", async (raw, ack = () => undefined) => {
      try {
        const input = sendSchema.parse(raw);
        const identity = await liveIdentity();
        assertSocketMessageRateLimit(identity.user.id);
        const result = await sendChatMessage({
          conversationId: input.conversation_id,
          viewer: identity.user,
          clientMessageId: input.client_message_id,
          content: input.content,
        });
        const message = toMessage(result.message);
        if (result.created) {
          io.to(`conversation:${input.conversation_id}`).emit("message:created", { message });
        }
        ack({ ok: true, data: { message } });
      } catch (error) {
        ack(socketError(error));
      }
    });

    socket.on("conversation:read", async (raw, ack = () => undefined) => {
      try {
        const input = readSchema.parse(raw);
        const identity = await liveIdentity();
        const data = await markConversationRead({
          conversationId: input.conversation_id,
          viewerId: identity.user.id,
          lastMessageId: input.last_message_id,
        });
        io.to(`conversation:${input.conversation_id}`).emit("conversation:read", {
          conversation_id: input.conversation_id,
          reader_id: identity.user.id,
          ...data,
        });
        ack({ ok: true, data });
      } catch (error) {
        ack(socketError(error));
      }
    });
  });

  const unsubscribe = onRealtimeEvent((event) => {
    const payload = event.payload as Record<string, unknown>;
    if (event.eventType === "session.revoked") {
      const userId = payload.user_id;
      if (typeof userId === "string") io.in(`user:${userId}`).disconnectSockets(true);
      const sessionIds = Array.isArray(payload.session_ids) ? payload.session_ids : [];
      for (const sessionId of sessionIds) {
        if (typeof sessionId === "string") io.in(`session:${sessionId}`).disconnectSockets(true);
      }
      return;
    }
    if (event.eventType === "message.created") {
      const recipient = payload.recipient_id;
      const data = payload.message ? { message: payload.message } : payload;
      if (typeof recipient === "string") io.to(`user:${recipient}`).emit("message:created", data);
      io.to(`conversation:${event.aggregateId}`).emit("message:created", data);
      return;
    }
    if (event.eventType === "conversation.read") {
      io.to(`conversation:${event.aggregateId}`).emit("conversation:read", payload);
      return;
    }
    const recipients = Array.isArray(payload.recipients) ? payload.recipients : [];
    for (const recipient of recipients) {
      if (typeof recipient === "string") io.to(`user:${recipient}`).emit(event.eventType, payload);
    }
  });

  return {
    close: async () => {
      unsubscribe();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
