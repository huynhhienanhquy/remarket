import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../../contexts/SessionContext";
import { loginPathFor } from "../../config/route/guards";
import { errorTitle } from "../../helpers/errors";
import { api } from "../../services/api";
import { queryKeys } from "../../config/queryClient";
import { Button, FormField, InlineAlert, Input, Skeleton, useToast } from "../../components/common";
import { OfflineNotice, QueryFailure } from "../../components/common/PageFeedback/PageFeedback";
import { useConnectivity } from "../../hooks/useConnectivity";

export function VerifyEmailPage() {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [token] = useState(() => params.get("token"));
  const navigate = useNavigate();
  const { viewer, status } = useSession();
  const online = useConnectivity();
  const toast = useToast();
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!params.has("token")) return;
    const next = new URLSearchParams(params); next.delete("token");
    setParams(next, { replace: true });
  }, [params, setParams]);
  const request = useQuery({
    queryKey: queryKeys.emailVerification(viewer?.id ?? "guest"),
    queryFn: () => api.auth.emailVerificationRequest(),
    enabled: !!viewer && !token && !viewer.email_verified_at && viewer.status === "ACTIVE",
    refetchInterval: 15000,
  });
  async function submit() {
    if (pending || !online) return;
    setPending(true); setError(null);
    try {
      if (token) await api.auth.verifyEmail(token);
      else await api.auth.requestEmailVerification();
      void client.invalidateQueries({ queryKey: ["email-verification"] });
      void client.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Đã gửi yêu cầu xác minh email", { description: "Vui lòng chờ admin xem xét và xác nhận." });
      navigate("/", { replace: true });
    } catch (caught) { setError(caught); }
    finally { setPending(false); }
  }
  const waiting = request.data?.status === "PENDING";
  return <div className="space-y-6">
    <div><h1 className="t-h1 text-ink">Xác minh email</h1><p className="mt-2 t-body text-muted">Gửi yêu cầu để admin xem xét và xác nhận email. Sau khi gửi, bạn sẽ quay về trang chủ.</p></div>
    <OfflineNotice online={online} />
    {error !== null && <InlineAlert tone="danger" title="Chưa thể gửi yêu cầu">{errorTitle(error)}</InlineAlert>}
    {status === "loading" ? <Skeleton className="h-32 w-full" /> : viewer?.email_verified_at ? <InlineAlert tone="success" title="Email đã được xác minh" /> : token ?
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-4">
        <p className="t-body text-muted">Liên kết này chỉ sử dụng một lần để gửi yêu cầu cho tài khoản sở hữu email. Email chưa được xác minh cho đến khi admin duyệt.</p>
        <Button type="submit" fullWidth size="lg" loading={pending} disabled={!online || pending}>Gửi yêu cầu xác minh email</Button>
        <Link to={loginPathFor("/verify-email", "")} className="block text-brand hover:underline">Liên kết hết hạn? Đăng nhập để gửi yêu cầu</Link>
      </form> : !viewer ? <div className="space-y-3">
        <InlineAlert tone="info" title="Đăng nhập để gửi yêu cầu">Yêu cầu chỉ được gửi cho email của chính tài khoản đang đăng nhập.</InlineAlert>
        <Link to={loginPathFor("/verify-email", "")} className="block rounded-control bg-brand p-3 text-center t-label text-white">Đăng nhập để xác minh email</Link>
      </div> : viewer.status === "LOCKED" ? <InlineAlert tone="warning" title="Tài khoản đang bị hạn chế">Liên hệ hỗ trợ để được hướng dẫn.</InlineAlert> : request.isPending ? <Skeleton className="h-32 w-full" /> : request.isError ? <QueryFailure error={request.error} retry={() => void request.refetch()} /> :
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-4">
        <FormField label="Email tài khoản" htmlFor="verification-email"><Input id="verification-email" value={viewer.email} readOnly type="email" /></FormField>
        {waiting ? <InlineAlert tone="info" title="Yêu cầu đang chờ admin duyệt">Bạn không cần gửi lại. Kết quả sẽ được thông báo trong tài khoản.</InlineAlert> : <Button type="submit" fullWidth size="lg" loading={pending} disabled={!online || pending}>Gửi yêu cầu xác minh email</Button>}
      </form>}
    <Link to="/" className="block text-center t-label text-brand hover:underline">Về trang chủ</Link>
  </div>;
}
