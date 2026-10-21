import { useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { ProductImage } from "@remarket/shared";
import { MarketplaceImage } from "./MarketplaceImage";
import { colors, IconButton, styles } from "./ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function ProductGallery({
  images,
  title,
}: {
  images: ProductImage[];
  title: string;
}) {
  const [selected, setSelected] = useState(0);
  const [full, setFull] = useState(false);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const image = images[selected] ?? images[0];
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mở ảnh toàn màn hình"
        disabled={!images.length}
        onPress={() => setFull(true)}
        style={{
          aspectRatio: 4 / 3,
          backgroundColor: colors.subtle,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {image ? (
          <MarketplaceImage
            uri={image.url}
            accessibilityLabel={title}
            style={{ width: "100%", height: "100%" }}
            contentFit="contain"
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Ionicons name="image-outline" size={28} color={colors.muted} />
            <Text style={styles.muted}>Chưa có ảnh</Text>
          </View>
        )}
        {images.length > 0 && (
          <View
            style={{
              position: "absolute",
              bottom: 12,
              right: 12,
              backgroundColor: colors.card,
              borderRadius: 8,
              padding: 8,
            }}
          >
            <Text style={styles.meta}>
              {selected + 1} / {images.length}
            </Text>
          </View>
        )}
      </Pressable>
      <ScrollView
        horizontal
        contentContainerStyle={{ gap: 8 }}
        showsHorizontalScrollIndicator={false}
      >
        {images.map((item, index) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`Ảnh ${index + 1}`}
            accessibilityState={{ selected: index === selected }}
            onPress={() => setSelected(index)}
            style={{
              borderWidth: 2,
              borderColor: selected === index ? colors.green : colors.border,
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <MarketplaceImage
              uri={item.url}
              style={{ width: 64, height: 64 }}
              contentFit="cover"
            />
          </Pressable>
        ))}
      </ScrollView>
      <Modal
        visible={full}
        animationType="fade"
        onRequestClose={() => setFull(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.text,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            justifyContent: "center",
          }}
        >
          <View
            style={{
              position: "absolute",
              top: insets.top + 12,
              right: 16,
              zIndex: 1,
            }}
          >
            <IconButton
              icon="close"
              label="Đóng ảnh"
              onPress={() => setFull(false)}
            />
          </View>
          <ScrollView
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          >
            {image && (
              <MarketplaceImage
                uri={image.url}
                accessibilityLabel={`${title}, ảnh ${selected + 1}`}
                style={{ width, height: height * 0.7 }}
                contentFit="contain"
              />
            )}
          </ScrollView>
          <View
            style={[
              styles.row,
              { justifyContent: "space-around", padding: 16 },
            ]}
          >
            <IconButton
              icon="chevron-back"
              label="Ảnh trước"
              disabled={selected === 0}
              onPress={() => setSelected(selected - 1)}
            />
            <Text style={{ color: colors.card }}>
              {selected + 1} / {images.length}
            </Text>
            <IconButton
              icon="chevron-forward"
              label="Ảnh sau"
              disabled={selected >= images.length - 1}
              onPress={() => setSelected(selected + 1)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
