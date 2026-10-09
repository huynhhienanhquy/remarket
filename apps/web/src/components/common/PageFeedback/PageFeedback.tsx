import { Button, InlineAlert, Skeleton } from "..";
import { errorTitle, isApiError } from "../../../helpers/errors";

export function OfflineNotice({ online }: { online: boolean }) {
  return online ? null : <InlineAlert tone="warning" title="Bạn đang ngoại tuyến">Kết nối lại để gửi thay đổi.</InlineAlert>;
}

export function QueryFailure({ error, retry }: { error: unknown; retry?: () => void }) {
  return <InlineAlert tone="danger" title={errorTitle(error)} action={retry && <Button variant="secondary" onClick={retry}>Tải lại</Button>}>
    {isApiError(error) && <><p>{error.message}</p>{error.requestId && <p className="t-meta">Mã yêu cầu: {error.requestId}</p>}</>}
  </InlineAlert>;
}

export function ListLoading() {
  return <div aria-busy="true" aria-label="Đang tải dữ liệu" className="space-y-3">{[0, 1, 2].map((id) => <Skeleton key={id} className="h-24 w-full rounded-card" />)}</div>;
}
