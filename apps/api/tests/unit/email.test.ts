import net from "node:net";
import tls from "node:tls";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/utils/background-prisma.js", () => ({ backgroundPrisma: {} }));
vi.mock("../../src/config/env.js", () => ({ env: {
  jwtSecret: "unit-test-email-secret", publicWebUrl: "http://localhost:5173",
  smtp: { host: "smtp.test", port: 465, user: "test", password: "test", from: "test@example.test" },
} }));
import { env } from "../../src/config/env.js";
import { sendEmail } from "../../src/services/email.js";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("SMTP deadlines", () => {
  it("bounds a stalled STARTTLS upgrade and cleans both readers", async () => {
    vi.useFakeTimers(); env.smtp!.port = 587;
    const plain = new net.Socket(), secure = new net.Socket();
    vi.spyOn(net, "connect").mockReturnValue(plain);
    vi.spyOn(tls, "connect").mockReturnValue(secure as tls.TLSSocket);
    vi.spyOn(plain, "write").mockReturnValue(true);
    const result = expect(sendEmail({ to: "user@example.test", subject: "test", text: "test" })).rejects.toThrow(/timed out/);
    plain.emit("connect"); plain.emit("data", Buffer.from("220 ready\r\n"));
    await vi.advanceTimersByTimeAsync(0);
    plain.emit("data", Buffer.from("250 capabilities\r\n"));
    await vi.advanceTimersByTimeAsync(0);
    plain.emit("data", Buffer.from("220 upgrade\r\n"));
    await vi.advanceTimersByTimeAsync(0);
    expect(tls.connect).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15_001); await result;
    expect(secure.destroyed).toBe(true);
    for (const socket of [plain, secure]) {
      expect(socket.listenerCount("data")).toBe(0); expect(socket.listenerCount("error")).toBe(0);
    }
    plain.destroy(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([465, 587])("bounds a stalled initial handshake on port %s and destroys the socket", async (port) => {
    vi.useFakeTimers();
    env.smtp!.port = port;
    const socket = new net.Socket();
    vi.spyOn(net, "connect").mockReturnValue(socket);
    vi.spyOn(tls, "connect").mockReturnValue(socket as tls.TLSSocket);
    const result = expect(sendEmail({ to: "user@example.test", subject: "test", text: "test" })).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(15_001);
    await result;
    expect(socket.destroyed).toBe(true);
    expect(socket.listenerCount("data")).toBe(0);
    expect(socket.listenerCount("error")).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
