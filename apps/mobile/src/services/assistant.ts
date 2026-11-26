import { useQuery } from "@tanstack/react-query";
import { toByteArray } from "base64-js";
import { api, session } from "./runtime";
import { useSession } from "./session-context";

export function useAssistantAvailability() {
  const { user } = useSession();
  const generation = session.getGeneration();
  return useQuery({
    queryKey: ["ai", "config", user?.id, generation],
    queryFn: api.ai.config,
    enabled: user?.status === "ACTIVE",
  });
}

function expiresSoon(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return false;
    const bytes = toByteArray(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="));
    const { exp } = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: number };
    return typeof exp === "number" && exp * 1_000 <= Date.now() + 20_000;
  } catch {
    return false;
  }
}

export async function assistantHeaders(generation: number) {
  function assertSession() {
    if (session.getGeneration() !== generation || session.getSnapshot().user?.status !== "ACTIVE")
      throw new Error("Phiên đăng nhập đã thay đổi.");
  }
  assertSession();
  const current = session.getToken();
  if (!current || expiresSoon(current)) await session.refresh();
  assertSession();
  const token = session.getToken();
  if (!token) throw new Error("Vui lòng đăng nhập lại.");
  return { Authorization: `Bearer ${token}` };
}
