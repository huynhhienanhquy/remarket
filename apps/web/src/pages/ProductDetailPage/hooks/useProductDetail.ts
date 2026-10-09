import { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { queryKeys } from "@/config/queryClient";
import { isApiError } from "@/helpers/errors";
import { useSession } from "@/contexts/SessionContext";
import { loginPathFor } from "@/config/route/guards";
import { useToast } from "@/components/common";
import { useConnectivity } from "@/hooks/useConnectivity";

/**
 * Owns the product query and guarded marketplace actions; guest redirects remain unchanged.
 * Called once by the route component; hook order and handlers match the original page.
 */
export function useProductDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { viewer, status: sessionStatus } = useSession();
  const online = useConnectivity();

  const [activeImage, setActiveImage] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const detail = useQuery({
    queryKey: queryKeys.product(id),
    queryFn: () => api.products.detail(id),
    enabled: id !== "",
  });

  const product = detail.data;

  const toggleFavorite = useMutation({
    mutationFn: (on: boolean) => api.favorites.set(id, on),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
    onError: (error) => toast.error("Không lưu được món đồ", { description: error.message }),
  });

  const addToCart = useMutation({
    mutationFn: () => api.cart.add(id),
    onSuccess: () => {
      toast.success("Đã thêm vào giỏ hàng", {
        action: { label: "Xem giỏ hàng", to: "/cart" },
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.cart });
    },
    onError: (error) =>
      toast.error(isApiError(error) && error.code === "VERSION_CONFLICT" ? "Món đồ đã thay đổi" : "Không thêm được vào giỏ", {
        description: error.message,
      }),
  });

  const loginThen = loginPathFor(location.pathname, location.search);

  function requireLogin() {
    if (sessionStatus !== "ready" || !online) return false;
    if (viewer) return true;
    navigate(loginThen);
    return false;
  }

  const chat = useMutation({
    mutationFn: () => api.chat.open(id),
    onSuccess: (conversation) => navigate(`/messages/${conversation.id}`),
    onError: (error) => toast.error("Không mở được tin nhắn", { description: error.message }),
  });
  const purchase = useMutation({
    mutationFn: () => api.cart.add(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      navigate(`/checkout?items=${encodeURIComponent(id)}`);
    },
    onError: (error) => toast.error("Không khởi tạo được đơn hàng", { description: error.message }),
  });
  const actionBusy = !online || sessionStatus !== "ready" || chat.isPending || purchase.isPending || addToCart.isPending || toggleFavorite.isPending;
  function openChat() { if (!actionBusy && requireLogin()) chat.mutate(); }
  function buyNow() { if (!actionBusy && requireLogin()) purchase.mutate(); }
  function addItem() { if (!actionBusy && requireLogin()) addToCart.mutate(); }

  const images = product?.images ?? [];
  const mainImage = images[activeImage] ?? images[0];

  const unavailableBanner = useMemo(() => {
    if (!product) return null;
    if (product.status === "RESERVED") {
      return {
        tone: "info" as const,
        title: "Sản phẩm đang được giữ cho một giao dịch",
      };
    }
    if (product.status === "SOLD") {
      return { tone: "neutral" as const, title: "Sản phẩm đã bán" };
    }
    if (product.is_blocked) {
      return { tone: "danger" as const, title: "Tin đăng không còn khả dụng" };
    }
    if (product.status === "REJECTED" && product.rejection_reason) {
      return { tone: "warning" as const, title: "Tin đăng không được phê duyệt", body: product.rejection_reason };
    }
    return null;
  }, [product]);
  return {
    viewer,
    online,
    activeImage,
    setActiveImage,
    viewerOpen,
    setViewerOpen,
    reportOpen,
    setReportOpen,
    detail,
    product,
    toggleFavorite,
    addToCart,
    requireLogin,
    chat,
    purchase,
    actionBusy,
    openChat,
    buyNow,
    addItem,
    images,
    mainImage,
    unavailableBanner,
  };
}
