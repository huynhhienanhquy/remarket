import { ChatIcon } from "../../components/common/Icon/Icon";
import { EmptyState } from "../../components/common/EmptyState/EmptyState";
import { ConversationPage } from "../ConversationPage/ConversationPage";

export function MessagesPage() {
  return (
    <ConversationPage
      placeholder={
        <div className="hidden items-center justify-center bg-surface p-6 md:flex">
          <EmptyState icon={<ChatIcon size={28} />} title="Bắt đầu cuộc trò chuyện" description="Chọn một cuộc trò chuyện để xem tin nhắn." />
        </div>
      }
    />
  );
}
