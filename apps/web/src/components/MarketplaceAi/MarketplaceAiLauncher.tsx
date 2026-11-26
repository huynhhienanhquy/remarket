import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import "./marketplace-ai.css";

const MarketplaceAi = lazy(() => import("./MarketplaceAi"));

export function MarketplaceAiLauncher({ userId }: { userId: string }) {
  const [hasOpened, setHasOpened] = useState(false);
  const [open, setOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const locationKey = useLocation().key;

  useEffect(() => { setOpen(false); }, [locationKey]);

  const changeOpen = useCallback((value: boolean) => {
    if (value) setHasOpened(true);
    setOpen(value);
    if (!value) launcher.current?.focus();
  }, []);

  return (
    <>
      <button ref={launcher} type="button" onClick={() => changeOpen(!open)} aria-expanded={open}
        className="rm-ai-launcher rm-fab rounded-full px-4 py-3 text-sm font-semibold text-white">
        <span className="rm-button-content inline-block">{open ? "Đóng trợ lý" : "Trợ lý ReMarket"}</span>
      </button>
      {hasOpened && (
        <Suspense fallback={open && (
          <p role="status" className="rm-ai-empty rounded-modal border border-line bg-surface p-4 shadow-pop">
            Đang tải trợ lý…
          </p>
        )}>
          <MarketplaceAi userId={userId} open={open} onOpenChange={changeOpen} />
        </Suspense>
      )}
    </>
  );
}
