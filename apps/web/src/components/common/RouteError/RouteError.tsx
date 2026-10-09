import { useRouteError, isRouteErrorResponse, Link } from "react-router-dom";
import { errorTitle, isApiError } from "../../../helpers/errors";
import { Button, InlineAlert } from "..";

/**
 * Route-level error boundary: the shell stays, the page body becomes an error
 * state with an optional request id (ui-spec 24).
 */
export function RouteError() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundBody />;
  }

  const title = errorTitle(error);
  const requestId = isApiError(error) ? error.requestId : undefined;

  return (
    <div className="rm-container py-16">
      <InlineAlert
        tone="danger"
        title={title}
        action={
          <div className="flex gap-3">
            <Button variant="primary" onClick={() => window.location.reload()}>
              Tải lại trang
            </Button>
            <Link to="/" className="inline-flex items-center t-label text-brand hover:underline">
              Về trang chủ
            </Link>
          </div>
        }
      >
        {isApiError(error) ? error.message : "Một lỗi không mong muốn đã xảy ra."}
        {requestId && (
          <span className="mt-2 block t-meta text-muted">
            Mã yêu cầu: <code>{requestId}</code>
          </span>
        )}
      </InlineAlert>
    </div>
  );
}

export function NotFoundBody() {
  return (
    <div className="rm-container flex flex-col items-center gap-4 py-20 text-center">
      <p className="t-hero text-brand">404</p>
      <h1 className="t-h1 text-ink">Không tìm thấy trang này</h1>
      <p className="max-w-md t-body text-muted">
        Trang bạn tìm không tồn tại hoặc đã bị di chuyển.
      </p>
      <div className="flex gap-3">
        <Link to="/">
          <Button variant="primary">Về trang chủ</Button>
        </Link>
        <Link to="/products">
          <Button variant="secondary">Khám phá sản phẩm</Button>
        </Link>
      </div>
    </div>
  );
}

export function ForbiddenBody() {
  return (
    <div className="rm-container flex flex-col items-center gap-4 py-20 text-center">
      <p className="t-hero text-brand">403</p>
      <h1 className="t-h1 text-ink">Bạn không có quyền truy cập</h1>
      <p className="max-w-md t-body text-muted">
        Khu vực này chỉ dành cho quản trị viên. Nếu bạn cho rằng đây là nhầm
        lẫn, hãy quay lại trang chủ.
      </p>
      <Link to="/">
        <Button variant="primary">Về trang chủ</Button>
      </Link>
    </div>
  );
}
