import { ChatIcon, EmptyState } from "../../components/ui";
import { ConversationList } from "./ConversationList";
import { AccountPageHeader } from "../../components/features/AccountPageHeader";

export function MessagesPage() {
  return <div className="space-y-6">
    <AccountPageHeader title="Tin nhắn" description="Trao đổi với người mua và người bán về món đồ của bạn." />
    <div className="rm-account-card grid overflow-hidden lg:min-h-[480px] xl:grid-cols-[minmax(280px,340px)_1fr]">
      <aside className="min-w-0 lg:max-h-[640px] lg:overflow-y-auto xl:border-r xl:border-line"><ConversationList /></aside>
      <div className="hidden bg-page/50 p-6 xl:flex xl:items-center xl:justify-center"><EmptyState className="rm-account-empty" icon={<ChatIcon size={28} />} title="Bắt đầu cuộc trò chuyện" description="Chọn một cuộc trò chuyện bên cạnh để xem tin nhắn và trao đổi về món đồ." /></div>
    </div>
  </div>;
}
