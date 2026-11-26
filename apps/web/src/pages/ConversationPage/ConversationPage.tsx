import { useState } from "react";
import type { ReactNode } from "react";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "../../components/common/Dialog/Dialog";
import { QueryFailure } from "../../components/common/PageFeedback/PageFeedback";
import { useToast } from "../../components/common/Toast/Toast";
import { ConversationList } from "../../components/ConversationList/ConversationList";
import { queryKeys } from "../../config/queryClient";
import { useSession } from "../../contexts/SessionContext";
import { useConnectivity } from "../../hooks/useConnectivity";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { api } from "../../services/api";
import { adminChatReturnPath } from "../../utils/chatNavigation";
import { ChatThread } from "./sections/ChatThread";

export function ConversationPage({ placeholder }: { placeholder?: ReactNode }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { viewer } = useSession();
  const client = useQueryClient();
  const toast = useToast();
  const online = useConnectivity();
  const splitView = useMediaQuery("(min-width: 768px)");
  const [deleteId, setDeleteId] = useState<string>();
  const sending = useIsMutating({ mutationKey: ["chat", "send", id], exact: true }) > 0;
  const remove = useMutation({
    mutationFn: (targetId: string) => api.chat.deleteConversation(targetId),
    onSuccess: async (_, targetId) => {
      const messagesKey = queryKeys.messages(targetId);
      await client.cancelQueries({ queryKey: messagesKey, exact: true });
      client.removeQueries({ queryKey: messagesKey, exact: true });
      client.removeQueries({ queryKey: ["chat", "detail", targetId], exact: true });
      void client.invalidateQueries({ queryKey: ["chat", "conversations"] });
      void client.invalidateQueries({ queryKey: ["chat", "unread-count"] });
      void client.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  function requestDelete(targetId: string) {
    remove.reset();
    setDeleteId(targetId);
  }

  function confirmDelete() {
    if (!deleteId || !online || remove.isPending) return;
    remove.mutate(deleteId, {
      onSuccess: (_, targetId) => {
        setDeleteId(undefined);
        toast.success("Đã xóa cuộc trò chuyện");
        if (targetId === id) {
          const destination = viewer?.role === "ADMIN" ? adminChatReturnPath(params.get("return_to")) ?? "/admin/users" : "/messages";
          navigate(destination, { replace: true });
        }
      },
    });
  }

  return (
    <>
      <div className="mx-auto grid h-full max-w-marketplace grid-rows-[minmax(0,1fr)] bg-surface md:grid-cols-[clamp(260px,36%,320px)_minmax(0,1fr)]">
        {!id && <h1 className="sr-only">Tin nhắn</h1>}
        {(!id || splitView) && (
          <aside aria-label="Danh sách cuộc trò chuyện" className={`min-h-0 min-w-0 overflow-y-auto bg-slate-50 md:border-r md:border-slate-100 ${id ? "hidden md:block" : ""}`}>
            <ConversationList activeId={id} onDelete={requestDelete} deleteDisabled={!online || remove.isPending} activeSending={sending} />
          </aside>
        )}
        {id ? <ChatThread key={id} id={id} onDelete={splitView ? undefined : () => requestDelete(id)} deleteDisabled={!online || sending || remove.isPending} /> : placeholder}
      </div>
      <ConfirmDialog
        open={deleteId !== undefined}
        title="Xóa cuộc trò chuyện?"
        description={
          <>
            <p>Tin nhắn cũ sẽ bị xóa khỏi hộp thư của bạn. Người còn lại vẫn xem được lịch sử của họ. Cuộc trò chuyện sẽ xuất hiện lại khi có tin nhắn mới.</p>
            {remove.isError && <div className="mt-3"><QueryFailure error={remove.error} /></div>}
          </>
        }
        confirmLabel="Xóa cuộc trò chuyện"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(undefined)}
      />
    </>
  );
}
