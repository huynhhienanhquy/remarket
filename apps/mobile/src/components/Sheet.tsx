import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, IconButton, styles } from "./ui";

export function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "#18313B66",
          paddingTop: insets.top + 24,
        }}
      >
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: colors.bg,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: "90%",
            width: "100%",
            maxWidth: 720,
            alignSelf: "center",
          }}
        >
          <View
            style={[
              styles.row,
              {
                justifyContent: "space-between",
                padding: 16,
                borderBottomWidth: 1,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.heading, { flex: 1 }]}>{title}</Text>
            <IconButton label="Đóng" icon="close" onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={{
              padding: 16,
              paddingBottom: Math.max(24, insets.bottom + 16),
              gap: 16,
            }}
          >
            {children}
          </ScrollView>
          {footer && (
            <View
              style={{
                padding: 16,
                paddingBottom: Math.max(16, insets.bottom),
                backgroundColor: colors.card,
                borderTopWidth: 1,
                borderColor: colors.border,
              }}
            >
              {footer}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
