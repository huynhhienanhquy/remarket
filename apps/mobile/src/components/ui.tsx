import tokens from "../../../../packages/shared/ui-tokens.json";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { HoverPressable as Pressable } from "./HoverPressable";
import type { TextInputProps } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, usePathname, useLocalSearchParams } from "expo-router";
import { loginReturnRoute } from "../services/linking";
import { showBottomNavigation } from "../services/navigation";
import { useSession } from "../services/session-context";
import { session } from "../services/runtime";
import { useNetInfo } from "@react-native-community/netinfo";
import type { Tone } from "@remarket/shared";
import { ApiError } from "@remarket/api-client";

const { color, radius } = tokens;
export const layout = tokens.layout;

export const colors = {
  bg: color.page,
  card: color.surface,
  text: color.ink,
  muted: color.muted,
  green: color.brand,
  greenPressed: color.brandHover,
  border: color.line,
  red: color.danger,
  soft: color.brandSoft,
  subtle: color.subtle,
  inputBorder: color.inputLine,
  dangerBg: color.dangerBg,
  warningBg: color.warningBg,
  info: color.info,
  infoBg: color.infoBg,
  accent: color.accent,
};
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
    width: "100%",
    maxWidth: layout.maxWidth,
    alignSelf: "center",
  },
  title: {
    letterSpacing: -0.35,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "700",
    color: colors.text,
  },
  heading: {
    letterSpacing: -0.2,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600",
    color: colors.text,
  },
  text: { fontSize: 16, lineHeight: 24, color: colors.text },
  muted: { fontSize: 14, lineHeight: 21, color: colors.muted },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    color: colors.text,
  },
  meta: { fontSize: 12, lineHeight: 18, color: colors.muted },
  card: {
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    padding: 12,
    fontSize: 16,
    minHeight: 48,
  },
  button: {
    backgroundColor: colors.green,
    borderRadius: radius.control,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: layout.touchTarget,
  },
  buttonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
    lineHeight: 20,
  },
  error: { color: colors.red, lineHeight: 21 },
});
export function Screen({
  title,
  children,
  onRefresh,
  refreshing = false,
  safeTop = false,
  footer,
  header,
  description,
  titleCard = false,
}: {
  title?: string;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  safeTop?: boolean;
  footer?: ReactNode;
  header?: ReactNode;
  description?: string;
  titleCard?: boolean;
}) {
  const { width } = useWindowDimensions();
  const horizontalPadding = width >= 1024 ? 32 : width >= 640 ? 24 : 16;
  const connectivity = useNetInfo();
  const bottomNavigation = showBottomNavigation(usePathname());
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={header || safeTop ? 0 : insets.top + layout.header}
    >
      {header}
      <ScrollView
        style={styles.page}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: horizontalPadding,
            paddingTop: safeTop ? insets.top + 16 : 16,
            paddingBottom: Math.max(32, insets.bottom + 16),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.green}
            />
          ) : undefined
        }
      >
        {title && (
          <View
            style={
              titleCard
                ? [styles.card, { borderRadius: radius.modal, padding: 20, gap: 8 }]
                : { gap: 8 }
            }
          >
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {description && <Text style={styles.muted}>{description}</Text>}
          </View>
        )}
        {user?.status === "LOCKED" && (
          <View style={[styles.card, { backgroundColor: colors.warningBg }]}>
            <Text style={styles.text}>
              Tài khoản đang bị hạn chế. Bạn vẫn có thể xử lý đơn hàng, xem
              thông báo và liên hệ hỗ trợ.
            </Text>
          </View>
        )}
        {connectivity.isConnected === false && (
          <Text style={styles.error}>
            Bạn đang ngoại tuyến. Nội dung mới sẽ cập nhật khi có kết nối.
          </Text>
        )}
        {children}
      </ScrollView>
      {footer && (
        <View
          style={{
            backgroundColor: colors.card,
            borderTopWidth: 1,
            borderColor: colors.border,
            padding: 12,
            paddingBottom: bottomNavigation ? 12 : 12 + insets.bottom,
          }}
        >
          {footer}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
export function Button({
  title,
  onPress,
  disabled,
  secondary,
  danger,
  loading,
  ghost,
  compact,
  icon,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
  loading?: boolean;
  ghost?: boolean;
  compact?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  const foreground = (secondary || ghost) && !danger ? colors.green : colors.card;
  return (
    <Pressable
      hover={danger ? "danger" : secondary ? "secondary" : ghost ? "action" : "primary"}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{
        disabled: !!disabled || !!loading,
        busy: !!loading,
      }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && { paddingHorizontal: 12 },
        secondary && {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.green,
        },
        danger && { backgroundColor: colors.red },
        ghost && { backgroundColor: "transparent", borderWidth: 0 },
        pressed && !secondary && !ghost && !danger && {
          backgroundColor: colors.greenPressed,
        },
        pressed && (secondary || ghost) && { backgroundColor: colors.soft },
        pressed && danger && { opacity: 0.8 },
        disabled && { opacity: 0.6 },
      ]}
    >
      <View style={{ alignItems: "center", justifyContent: "center" }}>
        {loading && (
          <View style={{ position: "absolute" }}>
            <ActivityIndicator color={foreground} />
          </View>
        )}
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 8, opacity: loading ? 0 : 1 }}
        >
          {icon && <Ionicons name={icon} size={20} color={foreground} />}
          <Text style={[styles.buttonText, { color: foreground, flexShrink: 1 }]}>
            {title}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
export function Field({
  label,
  error,
  hint,
  style,
  trailing,
  ...props
}: TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  trailing?: ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ position: "relative" }}>
        <TextInput
          accessibilityLabel={label}
          style={[
            styles.input,
            props.multiline && { minHeight: 120, textAlignVertical: "top" },
            error && { borderColor: colors.red },
            !!trailing && { paddingRight: 56 },
            style,
          ]}
          placeholderTextColor={colors.muted}
          autoCapitalize={props.secureTextEntry ? "none" : undefined}
          autoCorrect={props.secureTextEntry ? false : undefined}
          spellCheck={props.secureTextEntry ? false : undefined}
          {...props}
        />
        {trailing && (
          <View style={{ position: "absolute", top: 2, right: 4 }}>
            {trailing}
          </View>
        )}
      </View>
      {hint && <Text style={styles.meta}>{hint}</Text>}
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}
export function PasswordField(
  props: TextInputProps & { label: string; error?: string; hint?: string },
) {
  const [visible, setVisible] = useState(false);
  return (
    <Field
      {...props}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      secureTextEntry={!visible}
      trailing={
        <IconButton
          icon={visible ? "eye-off-outline" : "eye-outline"}
          label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          onPress={() => setVisible((current) => !current)}
        />
      }
    />
  );
}
export function fieldError(error: unknown, key: string): string | undefined {
  return error instanceof ApiError ? error.fields?.[key] : undefined;
}
export function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: Tone;
}) {
  const palette = {
    brand: [colors.green, colors.soft],
    warning: [colors.accent, colors.warningBg],
    danger: [colors.red, colors.dangerBg],
    info: [colors.info, colors.infoBg],
    neutral: [colors.muted, colors.subtle],
  };
  const [color, backgroundColor] = palette[tone];
  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor,
      }}
    >
      <Text style={[styles.meta, { color, fontWeight: "500" }]}>{label}</Text>
    </View>
  );
}
export function Feedback({
  loading,
  error,
  retry,
}: {
  loading?: boolean;
  error?: unknown;
  retry?: () => void;
}) {
  if (loading)
    return (
      <View
        accessibilityLabel="Đang tải"
        accessibilityState={{ busy: true }}
        style={[styles.card, { gap: 12 }]}
      >
        {["75%", "100%", "55%"].map((width, index) => (
          <View
            key={index}
            style={{
              width: width as `${number}%`,
              height: index === 0 ? 24 : 16,
              borderRadius: 4,
              backgroundColor: colors.subtle,
            }}
          />
        ))}
      </View>
    );
  if (!error) return null;
  return (
    <View style={styles.card}>
      <Text accessibilityRole="alert" style={styles.error}>
        {error instanceof Error ? error.message : "Không thể tải dữ liệu."}
      </Text>
      {error instanceof ApiError &&
        Object.entries(error.fields ?? {}).map(([key, value]) => (
          <Text key={key} style={styles.error}>
            {value}
          </Text>
        ))}
      {retry && <Button title="Thử lại" onPress={retry} />}
    </View>
  );
}
export function LoginPrompt() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{
    product_id?: string;
    items?: string;
    order_id?: string;
    role?: string;
  }>();
  const query =
    pathname === "/checkout" && params.product_id
      ? `?product_id=${params.product_id}`
      : pathname === "/checkout" && params.items
        ? `?items=${params.items}`
      : pathname === "/support/new" && params.order_id
        ? `?order_id=${params.order_id}`
        : pathname === "/orders" && params.role
          ? `?role=${params.role}`
          : "";
  const state = useSession();
  if (state.loading || state.error)
    return (
      <Feedback
        loading={state.loading}
        error={state.error ? new Error(state.error) : null}
        retry={() => {
          void session.restore().catch(() => undefined);
        }}
      />
    );
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Đăng nhập để tiếp tục</Text>
      <Text style={styles.muted}>
        Lưu món đồ yêu thích, đăng bán và trò chuyện với người mua.
      </Text>
      <Button
        title="Đăng nhập"
        onPress={() =>
          router.push({
            pathname: "/login",
            params: { returnTo: loginReturnRoute(pathname + query) },
          })
        }
      />
    </View>
  );
}
export function IconButton({
  icon,
  label,
  onPress,
  badge,
  badgeLabel = "chưa đọc",
  disabled,
  round,
  color = colors.text,
  filled,
  outline,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  badge?: number;
  badgeLabel?: string;
  disabled?: boolean;
  round?: boolean;
  color?: string;
  filled?: boolean;
  outline?: boolean;
}) {
  return (
    <Pressable
      hover="icon"
      accessibilityRole="button"
      accessibilityLabel={`${label}${badge ? `, ${badge} ${badgeLabel}` : ""}`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={({ pressed }) => ({
        width: layout.touchTarget,
        height: layout.touchTarget,
        borderRadius: round ? layout.touchTarget / 2 : radius.control,
        backgroundColor: filled ? colors.green : colors.card,
        borderWidth: outline ? 1 : 0,
        borderColor: colors.green,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={filled ? colors.card : color} />
      {!!badge && (
        <View
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            backgroundColor: colors.red,
            borderRadius: 10,
            paddingHorizontal: 4,
          }}
        >
          <Text style={{ color: colors.card, fontSize: 10 }}>
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon = "leaf-outline",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <View style={[styles.card, { paddingVertical: 28, alignItems: "center" }]}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          backgroundColor: colors.soft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={28} color={colors.green} />
      </View>
      <Text style={[styles.heading, { textAlign: "center" }]}>{title}</Text>
      {description && (
        <Text style={[styles.muted, { textAlign: "center" }]}>
          {description}
        </Text>
      )}
      {action}
    </View>
  );
}

export function Pagination({
  page,
  total,
  pageSize = 20,
  onChange,
}: {
  page: number;
  total: number;
  pageSize?: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1 && page === 1) return null;
  return (
    <View style={[styles.row, { justifyContent: "space-between" }]}>
      <IconButton
        icon="chevron-back"
        label="Trang trước"
        disabled={page <= 1}
        onPress={() => onChange(page - 1)}
      />
      <Text style={styles.muted}>
        Trang {page} / {pages}
      </Text>
      <IconButton
        icon="chevron-forward"
        label="Trang sau"
        disabled={page >= pages}
        onPress={() => onChange(page + 1)}
      />
    </View>
  );
}

export function MenuRow({
  title,
  description,
  icon,
  onPress,
}: {
  title: string;
  description?: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
}) {
  return (
    <Pressable
      hover="navigation"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          flexWrap: "nowrap",
          paddingVertical: 8,
          minHeight: 52,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <View
        style={{ padding: 8, borderRadius: 8, backgroundColor: colors.soft }}
      >
        <Ionicons name={icon} size={20} color={colors.green} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{title}</Text>
        {description && <Text style={styles.meta}>{description}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}
export function useAction() {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (action: () => Promise<unknown>, success?: string) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
      if (success) Alert.alert("ReMarket", success);
    } catch (caught) {
      setError(caught);
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return { pending, error, run };
}
