import { useEffect, useState } from "react";
import { Button, InlineAlert, Skeleton } from "../ui";
import { errorTitle, isApiError } from "../../lib/errors";

export function useConnectivity() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}

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

export function urlPage(raw: string | null) {
  const page = Number(raw);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}
