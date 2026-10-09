import { Button, InlineAlert } from "@/components/common";
import { errorTitle, isApiError } from "@/helpers/errors";

/** Inline error with the mandatory "Tải lại" action (ui-spec 24). */
export function QueryErrorAlert({
  error,
  onRetry,
  title,
}: {
  error: unknown;
  onRetry: () => void;
  title?: string;
}) {
  const network = isApiError(error) && error.isNetwork;
  const requestId = isApiError(error) ? error.requestId : undefined;
  return (
    <InlineAlert
      tone="danger"
      title={title ?? errorTitle(error)}
      action={
        <Button variant="secondary" onClick={onRetry}>
          Tải lại
        </Button>
      }
    >
      {network
        ? "Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại."
        : "Chưa tải được dữ liệu. Vui lòng thử lại."}
      {requestId ? ` Mã yêu cầu: ${requestId}` : null}
    </InlineAlert>
  );
}
