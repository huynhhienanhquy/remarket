import type { CopilotKitMessageFilter } from "@copilotkit/react-core/v2";
import { getSessionUser } from "../stores/sessionStore";
import { http } from "./http";

export const lastUserMessage: CopilotKitMessageFilter = (messages) => {
  const message = messages.at(-1);
  return message?.role === "user" ? [message] : [];
};

function expiresSoon(token: string | null) {
  if (!token) return true;
  try {
    const payload = token.split(".")[1] ?? "";
    const { exp } = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return typeof exp === "number" && exp * 1_000 <= Date.now() + 20_000;
  } catch {
    return false;
  }
}

export async function copilotHeaders(userId: string): Promise<Record<string, string>> {
  if (getSessionUser()?.id !== userId) throw new Error("Phiên đăng nhập đã thay đổi.");
  if (expiresSoon(http.getAccessToken())) await http.restoreSession("refresh");
  const token = http.getAccessToken();
  if (!token || getSessionUser()?.id !== userId) throw new Error("Vui lòng đăng nhập lại.");
  return { Authorization: `Bearer ${token}` };
}
