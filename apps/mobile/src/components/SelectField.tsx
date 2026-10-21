import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Field, colors, styles } from "./ui";
import { Sheet } from "./Sheet";

export function SelectField({
  label,
  value,
  items,
  onChange,
  disabled = false,
  compact = false,
}: {
  label: string;
  value: string;
  items: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const matches = items.filter((item) =>
    item.label.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")),
  );
  return (
    <View style={{ gap: 6 }}>
      {!compact && <Text style={styles.label}>{label}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{
          text:
            items.find((item) => item.value === value)?.label ?? "Chưa chọn",
        }}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => {
          setSearch("");
          setOpen(true);
        }}
        style={[
          styles.input,
          styles.row,
          {
            flexWrap: "nowrap",
            justifyContent: "space-between",
            opacity: disabled ? 0.5 : 1,
            minHeight: compact ? 44 : 48,
            paddingVertical: compact ? 8 : 12,
            borderColor: compact ? colors.border : colors.inputBorder,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[compact ? styles.label : styles.text, { flex: 1 }]}
        >
          {items.find((item) => item.value === value)?.label ?? "Chọn…"}
        </Text>
        <Ionicons name="chevron-down" size={20} color={colors.muted} />
      </Pressable>
      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        <Field
          label={`Tìm ${label.toLowerCase()}`}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {matches.map((item) => (
          <Pressable
            key={item.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: item.value === value }}
            onPress={() => {
              onChange(item.value);
              setOpen(false);
            }}
            style={[
              styles.row,
              {
                minHeight: 48,
                padding: 12,
                borderRadius: 8,
                backgroundColor:
                  item.value === value ? colors.soft : colors.card,
                flexWrap: "nowrap",
              },
            ]}
          >
            <Text style={[styles.text, { flex: 1 }]}>{item.label}</Text>
            {item.value === value && (
              <Ionicons name="checkmark" size={20} color={colors.green} />
            )}
          </Pressable>
        ))}
        {!matches.length && (
          <Text style={styles.muted}>Không có lựa chọn phù hợp.</Text>
        )}
      </Sheet>
    </View>
  );
}
