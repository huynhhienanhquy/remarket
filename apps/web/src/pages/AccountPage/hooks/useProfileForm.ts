import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { SessionUser } from "@remarket/shared";
import { useSession } from "@/contexts/SessionContext";
import { api } from "@/services/api";
import { queryKeys } from "@/config/queryClient";
import { apiFieldErrors } from "@/helpers/errors";
import { useToast } from "@/components/common";
import { useConnectivity } from "@/hooks/useConnectivity";

/**
 * Owns profile drafts and mutations; the parent keeps the existing key that resets edited profile state.
 * Called once by the route component; hook order and handlers match the original page.
 */
export function useProfileForm(viewer: SessionUser) {
  const { refresh, expire } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const online = useConnectivity();
  const [name, setName] = useState(viewer.full_name);
  const [phone, setPhone] = useState(viewer.phone ?? "");
  const [province, setProvince] = useState(viewer.province_code ?? "");
  const [address, setAddress] = useState(viewer.default_address ?? "");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const provinces = useQuery({ queryKey: queryKeys.provinces, queryFn: () => api.categories.provinces() });
  const save = useMutation({ mutationFn: () => api.auth.updateProfile({ full_name: name.trim(), phone: phone.trim() || null, province_code: province || null, default_address: address.trim() || null }),
    onSuccess: async () => { await refresh(); toast.success("Đã lưu hồ sơ"); }, onError: (error) => setFields(apiFieldErrors(error) ?? {}) });
  const avatar = useMutation({ mutationFn: async (file: File) => { const uploaded = await api.uploads.upload(file, "avatar"); return api.auth.uploadAvatar(uploaded.storage_path); }, onSuccess: async () => { await refresh(); toast.success("Đã đổi ảnh đại diện"); } });
  const logoutAll = useMutation({ mutationFn: () => api.auth.logoutAll(), onSuccess: () => { expire(); navigate("/login", { replace: true }); } });
  const busy = save.isPending || avatar.isPending || logoutAll.isPending;
  const dirty = name !== viewer.full_name || phone !== (viewer.phone ?? "") || province !== (viewer.province_code ?? "") || address !== (viewer.default_address ?? "");
  return {
    toast,
    online,
    name,
    setName,
    phone,
    setPhone,
    province,
    setProvince,
    address,
    setAddress,
    fields,
    setFields,
    logoutConfirm,
    setLogoutConfirm,
    avatarInput,
    provinces,
    save,
    avatar,
    logoutAll,
    busy,
    dirty,
  };
}
