import type { EmailVerificationRequest } from "@remarket/shared";
import type { MockUser } from "./types";
import { db } from "./store";
import { uid } from "./time";
import { notFound, requireActive } from "./adapter-helpers";

export function projectEmailVerification(user: MockUser): EmailVerificationRequest | null {
  if (!user.email_verification_requested_at) return null;
  return {
    id: user.id, user: { id: user.id, full_name: user.full_name, email: user.email, status: user.status },
    status: user.email_verified_at ? "APPROVED" : "PENDING",
    requested_at: user.email_verification_requested_at, approved_at: user.email_verified_at,
  };
}

export function requestMockEmailVerification(user: MockUser) {
  requireActive(user);
  if (user.email_verified_at || user.email_verification_requested_at) return projectEmailVerification(user);
  const now = new Date().toISOString();
  user.email_verification_requested_at = now;
  for (const admin of db().users.filter((item) => item.role === "ADMIN" && item.status === "ACTIVE")) {
    db().notifications.push({
      id: uid(11, db().notifications.length + 100), user_id: admin.id, type: "EMAIL_VERIFICATION_REQUESTED",
      title: "Yêu cầu xác minh email", content: `${user.full_name} đã gửi yêu cầu xác minh email.`,
      reference_type: "email_verification", reference_id: user.id, read_at: null, created_at: now,
    });
  }
  db().audit_logs.push({
    id: uid(12, db().audit_logs.length + 100), actor_id: user.id, actor_name: user.full_name, actor_type: "USER",
    action: "user.email_verification_requested", entity_type: "user", entity_id: user.id,
    reason: null, metadata: {}, created_at: now,
  });
  return projectEmailVerification(user);
}

export function approveMockEmailVerification(user: MockUser, admin: MockUser): EmailVerificationRequest {
  if (!user.email_verification_requested_at) notFound("Không tìm thấy yêu cầu xác minh email.");
  if (!user.email_verified_at) {
    const now = new Date().toISOString();
    user.email_verified_at = now;
    db().notifications.push({
      id: uid(11, db().notifications.length + 100), user_id: user.id, type: "EMAIL_VERIFIED",
      title: "Email đã được xác minh", content: "Admin đã đồng ý xác minh email của bạn.",
      reference_type: "account", reference_id: user.id, read_at: null, created_at: now,
    });
    db().audit_logs.push({
      id: uid(12, db().audit_logs.length + 100), actor_id: admin.id, actor_name: admin.full_name, actor_type: "ADMIN",
      action: "user.email_verified", entity_type: "user", entity_id: user.id,
      reason: null, metadata: { email_verified_at: now }, created_at: now,
    });
  }
  return projectEmailVerification(user)!;
}
