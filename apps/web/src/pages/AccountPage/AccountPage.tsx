import { ProfileForm } from "./sections/ProfileForm";
import { Link } from "react-router-dom";
import { useSession } from "../../contexts/SessionContext";
import { InlineAlert } from "../../components/common";
import { AccountPageHeader } from "../../components/AccountPageHeader/AccountPageHeader";

export function AccountPage() {
  const { viewer } = useSession();
  if (!viewer) return null;
  return <div className="space-y-6"><AccountPageHeader title="Hồ sơ cá nhân" description={`Chào ${viewer.full_name}, quản lý thông tin cá nhân và bảo mật tài khoản của bạn.`} />{viewer.status === "LOCKED" ? <InlineAlert tone="warning" title="Tài khoản đang bị hạn chế"><Link to="/support" className="text-brand">Liên hệ hỗ trợ</Link></InlineAlert> : <ProfileForm key={`${viewer.id}:${viewer.full_name}:${viewer.phone}:${viewer.province_code}:${viewer.default_address}`} viewer={viewer} />}</div>;
}
