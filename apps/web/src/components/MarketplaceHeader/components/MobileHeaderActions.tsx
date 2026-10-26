import { useLocation } from "react-router-dom";
import { useSession } from "../../../contexts/SessionContext";
import { useUnreadCounts } from "../../../hooks/useUnreadCounts";
import { loginPathFor } from "../../../config/route/guards";
import { BellIcon, CartIcon, ChatIcon } from "../../common";
import { IconButton } from "./HeaderIconLink";

export function MobileHeaderActions() {
  const { viewer } = useSession();
  const location = useLocation();
  const { messages, notifications, cart } = useUnreadCounts(viewer !== null);
  const loginFor = loginPathFor(location.pathname, location.search);

  return <nav aria-label="Tiện ích di động" className="ml-auto flex shrink-0 items-center gap-0.5">
    <IconButton to={viewer ? "/messages" : loginFor} label="Tin nhắn" badge={messages} visibleWhenGuest><ChatIcon /></IconButton>
    <IconButton to={viewer ? "/notifications" : loginFor} label="Thông báo" badge={notifications} visibleWhenGuest><BellIcon /></IconButton>
    <IconButton to={viewer ? "/cart" : loginFor} label="Giỏ hàng" badge={cart} visibleWhenGuest><CartIcon /></IconButton>
  </nav>;
}
