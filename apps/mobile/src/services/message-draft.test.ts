import { describe, expect, it } from "vitest";
import { ApiError } from "@remarket/api-client";
import { CHAT_LIMITS } from "@remarket/shared";
import { canRetryMessage, messageDraftError } from "./message-draft";

describe("editable message drafts", () => {
  it("validates the message limit before sending and accepts a corrected draft", () => {
    expect(messageDraftError("x".repeat(CHAT_LIMITS.messageMax + 1))).toContain(String(CHAT_LIMITS.messageMax));
    expect(messageDraftError("x".repeat(CHAT_LIMITS.messageMax))).toBeNull();
    expect(messageDraftError("   ")).not.toBeNull();
    expect(messageDraftError("Đã sửa nội dung")).toBeNull();
  });
  it.each([400, 401, 403, 409, 422, 429])("keeps a %s rejection editable instead of retrying the same payload", (status) => {
    expect(canRetryMessage(new ApiError({ code: "VALIDATION_ERROR", message: "Rejected", status }))).toBe(false);
  });
  it.each([0, 500, 503])("retains an uncertain %s send for retry with the same message id", (status) => {
    expect(canRetryMessage(new ApiError({ code: "NETWORK_ERROR", message: "Uncertain", status }))).toBe(true);
  });
});
