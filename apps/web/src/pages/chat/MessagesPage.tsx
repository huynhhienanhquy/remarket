import { EmptyState } from "../../components/ui";
import { ConversationList } from "./ConversationList";

export function MessagesPage() {
  return <div className="rm-container grid py-4 lg:h-[calc(100dvh-56px)] lg:grid-cols-[320px_1fr] lg:py-6">
    <aside className="overflow-y-auto rounded-card border border-line bg-surface"><ConversationList /></aside>
    <div className="hidden lg:flex lg:items-center lg:justify-center"><EmptyState title="Chọn cuộc trò chuyện" description="Trao đổi với người mua hoặc người bán về món đồ của bạn." /></div>
  </div>;
}
