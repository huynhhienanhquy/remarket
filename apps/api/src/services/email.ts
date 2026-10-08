import net from "node:net";
import tls from "node:tls";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Socket } from "node:net";
import type { TLSSocket } from "node:tls";
import { env } from "../config/env.js";
import type { RealtimeEvent } from "../outbox/outbox.js";
import { prisma } from "../utils/prisma.js";

type SmtpSocket = Socket | TLSSocket;

const tokenEncryptionKey = createHash("sha256").update(env.jwtSecret, "utf8").digest();

export function sealEmailToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenEncryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function openEmailToken(sealed: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = sealed.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Invalid encrypted email token");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    tokenEncryptionKey,
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

interface SmtpResponse {
  code: number;
  text: string;
}

interface ResponseReader {
  next(): Promise<SmtpResponse>;
  detach(): void;
}

function responseReader(socket: SmtpSocket): ResponseReader {
  let buffer = "";
  let lines: string[] = [];
  const queued: SmtpResponse[] = [];
  const waiting: Array<{
    resolve: (response: SmtpResponse) => void;
    reject: (error: Error) => void;
  }> = [];

  const deliver = (response: SmtpResponse): void => {
    const waiter = waiting.shift();
    if (waiter) waiter.resolve(response);
    else queued.push(response);
  };
  const fail = (error: Error): void => {
    for (const waiter of waiting.splice(0)) waiter.reject(error);
  };
  const onData = (chunk: Buffer): void => {
    buffer += chunk.toString("utf8");
    for (;;) {
      const end = buffer.indexOf("\r\n");
      if (end < 0) break;
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      lines.push(line);
      const match = /^(\d{3}) /.exec(line);
      if (match) {
        deliver({ code: Number(match[1]), text: lines.join("\n") });
        lines = [];
      }
    }
  };
  const onError = (error: Error): void => fail(error);
  const onClose = (): void => fail(new Error("SMTP connection closed unexpectedly"));
  socket.on("data", onData);
  socket.on("error", onError);
  socket.on("close", onClose);

  return {
    next: () => {
      const ready = queued.shift();
      if (ready) return Promise.resolve(ready);
      return new Promise<SmtpResponse>((resolve, reject) => waiting.push({ resolve, reject }));
    },
    detach: () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    },
  };
}

function waitForConnect(socket: SmtpSocket, event: "connect" | "secureConnect"): Promise<void> {
  return new Promise((resolve, reject) => {
    const onReady = (): void => {
      socket.off("error", onError);
      resolve();
    };
    const onError = (error: Error): void => {
      socket.off(event, onReady);
      reject(error);
    };
    socket.once(event, onReady);
    socket.once("error", onError);
  });
}

function command(socket: SmtpSocket, value: string): void {
  socket.write(`${value}\r\n`, "utf8");
}

async function expect(reader: ResponseReader, accepted: number[]): Promise<SmtpResponse> {
  const response = await reader.next();
  if (!accepted.includes(response.code)) {
    throw new Error(`SMTP command failed with status ${response.code}`);
  }
  return response;
}

function encodedHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function cleanAddress(value: string): string {
  const cleaned = value.replace(/[\r\n]/g, "").trim();
  const bracketed = /<([^>]+)>/.exec(cleaned)?.[1];
  return bracketed ?? cleaned;
}

/** Minimal SMTP client: implicit TLS on 465, STARTTLS on all other ports. */
export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const config = env.smtp;
  if (!config) throw new Error("SMTP is not configured");

  let socket: SmtpSocket;
  if (config.port === 465) {
    socket = tls.connect({ host: config.host, port: config.port, servername: config.host });
    await waitForConnect(socket, "secureConnect");
  } else {
    socket = net.connect({ host: config.host, port: config.port });
    await waitForConnect(socket, "connect");
  }
  socket.setTimeout(15_000, () => socket.destroy(new Error("SMTP connection timed out")));

  let reader = responseReader(socket);
  try {
    await expect(reader, [220]);
    command(socket, `EHLO ${new URL(env.publicWebUrl).hostname}`);
    await expect(reader, [250]);

    if (!(socket instanceof tls.TLSSocket)) {
      command(socket, "STARTTLS");
      await expect(reader, [220]);
      reader.detach();
      socket = tls.connect({ socket, servername: config.host });
      await waitForConnect(socket, "secureConnect");
      socket.setTimeout(15_000, () => socket.destroy(new Error("SMTP connection timed out")));
      reader = responseReader(socket);
      command(socket, `EHLO ${new URL(env.publicWebUrl).hostname}`);
      await expect(reader, [250]);
    }

    command(socket, "AUTH LOGIN");
    await expect(reader, [334]);
    command(socket, Buffer.from(config.user, "utf8").toString("base64"));
    await expect(reader, [334]);
    command(socket, Buffer.from(config.password, "utf8").toString("base64"));
    await expect(reader, [235]);

    command(socket, `MAIL FROM:<${cleanAddress(config.from)}>`);
    await expect(reader, [250]);
    command(socket, `RCPT TO:<${cleanAddress(input.to)}>`);
    await expect(reader, [250, 251]);
    command(socket, "DATA");
    await expect(reader, [354]);

    const body = input.text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    socket.write(
      [
        `From: ReMarket <${cleanAddress(config.from)}>`,
        `To: ${cleanAddress(input.to)}`,
        `Subject: ${encodedHeader(input.subject)}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        body,
        ".",
        "",
      ].join("\r\n"),
      "utf8",
    );
    await expect(reader, [250]);
    command(socket, "QUIT");
    await expect(reader, [221]);
  } finally {
    reader.detach();
    socket.destroy();
  }
}

export async function deliverAuthEmail(event: RealtimeEvent): Promise<void> {
  const payload = event.payload as Record<string, unknown>;
  const to = payload.to;
  const purpose = payload.purpose;
  const tokenId = payload.token_id;
  const sealedToken = payload.sealed_token;
  if (
    typeof to !== "string" ||
    (purpose !== "VERIFY_EMAIL" && purpose !== "RESET_PASSWORD") ||
    typeof tokenId !== "string" ||
    typeof sealedToken !== "string"
  ) {
    throw new Error("Invalid email.auth outbox payload");
  }
  const active = await prisma.authToken.findFirst({
    where: { id: tokenId, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (!active) return;
  const token = openEmailToken(sealedToken);
  const route = purpose === "VERIFY_EMAIL" ? "verify-email" : "reset-password";
  const subject = purpose === "VERIFY_EMAIL" ? "Xác minh tài khoản ReMarket" : "Đặt lại mật khẩu ReMarket";
  const action = purpose === "VERIFY_EMAIL" ? "xác minh tài khoản" : "đặt lại mật khẩu";
  const url = `${env.publicWebUrl}/${route}?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to,
    subject,
    text: `Bạn vừa yêu cầu ${action} trên ReMarket.\n\nMở liên kết sau để tiếp tục:\n${url}\n\nNếu không thực hiện yêu cầu này, bạn có thể bỏ qua email.`,
  });
}
