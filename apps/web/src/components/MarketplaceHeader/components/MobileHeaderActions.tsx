import { useSession } from "../../../contexts/SessionContext";
import { useUnreadCounts } from "../../../hooks/useUnreadCounts";
import { loginPathFor } from "../../../config/route/guards";
import { BellIcon, CartIcon, ChatIcon } from "../../common/Icon/Icon";
import { IconButton } from "./HeaderIconLink";

export function MobileHeaderActions() {
  const { viewer } = useSession();
  const { messages, notifications, cart } = useUnreadCounts(viewer !== null);

  return <nav aria-label="Tiện ích di động" className="ml-auto flex shrink-0 items-center gap-0.5">
    <IconButton to={viewer ? "/messages" : loginPathFor("/messages", "")} label="Tin nhắn" badge={messages} visibleWhenGuest><ChatIcon /></IconButton>
    <IconButton to={viewer ? "/notifications" : loginPathFor("/notifications", "")} label="Thông báo" badge={notifications} visibleWhenGuest><BellIcon /></IconButton>
    <IconButton to={viewer ? "/cart" : loginPathFor("/cart", "")} label="Giỏ hàng" badge={cart} visibleWhenGuest><CartIcon /></IconButton>
  </nav>;
}
