import { ChatThread } from "./sections/ChatThread";
import { useParams } from "react-router-dom";
import { ConversationList } from "../../components/ConversationList/ConversationList";
import { useMediaQuery } from "../../hooks/useMediaQuery";

export function ConversationPage() {
  const { id = "" } = useParams();
  const showSidebar = useMediaQuery("(min-width: 1024px)");
  return <div className="grid lg:mx-auto lg:w-full lg:max-w-[1280px] lg:px-6 lg:h-[calc(100dvh-56px)] lg:grid-cols-[320px_1fr] lg:gap-4 lg:py-6">
    <aside className="hidden overflow-y-auto rounded-card border border-line bg-surface lg:block">{showSidebar && <ConversationList activeId={id} />}</aside>
    <ChatThread key={id} id={id} />
  </div>;
}
