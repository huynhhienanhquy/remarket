import { ChatIcon, EmptyState } from "../../components/common";
import { ConversationList } from "../../components/ConversationList/ConversationList";
import { AccountPageHeader } from "../../components/AccountPageHeader/AccountPageHeader";
import { useParams } from "react-router-dom";
import { useSession } from "../../contexts/SessionContext";
import { ConversationPage } from "../ConversationPage/ConversationPage";
import { ChatThread } from "../ConversationPage/sections/ChatThread";
import { useMediaQuery } from "../../hooks/useMediaQuery";

export function MessagesPage() {
  const { id } = useParams();
  const { viewer } = useSession();
  const showSidebar = useMediaQuery("(min-width: 1280px)");
  if (id && viewer?.role === "ADMIN") return <ConversationPage />;

  return <div className={id ? "lg:space-y-6" : "space-y-6"}>
    <div className={id ? "hidden lg:block" : undefined}><AccountPageHeader title="Tin nhắn" description="Trao đổi với người mua và người bán về món đồ của bạn." /></div>
    <div className={`rm-account-card grid overflow-hidden lg:h-[640px] xl:grid-cols-[minmax(280px,340px)_1fr] ${id ? "rounded-none border-0 shadow-none lg:rounded-2xl lg:border lg:shadow-subtle" : "lg:min-h-[480px]"}`}>
      <aside aria-label="Danh sách cuộc trò chuyện" className={`min-h-0 min-w-0 lg:overflow-y-auto xl:border-r xl:border-line ${id ? "hidden xl:block" : ""}`}>{(!id || showSidebar) && <ConversationList activeId={id} />}</aside>
      {id ? <ChatThread key={id} id={id} embedded /> : <div className="hidden bg-page/50 p-6 xl:flex xl:items-center xl:justify-center"><EmptyState className="rm-account-empty" icon={<ChatIcon size={28} />} title="Bắt đầu cuộc trò chuyện" description="Chọn một cuộc trò chuyện bên cạnh để xem tin nhắn và trao đổi về món đồ." /></div>}
    </div>
  </div>;
}
