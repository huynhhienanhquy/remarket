import { useState } from "react";
import { Text, View } from "react-native";
import { HoverPressable as Pressable } from "../../components/HoverPressable";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import {
  CONDITIONS,
  CONDITION_LABELS,
  DELIVERY_METHODS,
  formatVnd,
} from "@remarket/shared";
import type { ProductQuery, SortOption } from "@remarket/shared";
import { api } from "../../services/runtime";
import { useSession } from "../../services/session-context";
import {
  Button,
  colors,
  EmptyState,
  Feedback,
  Field,
  Pagination,
  Screen,
  styles,
} from "../../components/ui";
import { ProductGrid, ProductGridSkeleton } from "../../components/ProductCards";
import { SelectField } from "../../components/SelectField";
import { Sheet } from "../../components/Sheet";
import {
  MarketplaceFooter,
  MarketplaceHeader,
} from "../../components/MarketplaceHeader";
import {
  validateSearchFilters,
  deliveryLabel,
  productSearchFromParams,
} from "../../services/marketplace";

export default function Products() {
  const params = useLocalSearchParams();
  const initial = productSearchFromParams(params);
  return <ProductSearch key={JSON.stringify(initial)} initial={initial} />;
}

function ProductSearch({
  initial,
}: {
  initial: ReturnType<typeof productSearchFromParams>;
}) {
  const { user } = useSession();
  const [input, setInput] = useState(initial.q);
  const [q, setQ] = useState(initial.q);
  const [category, setCategory] = useState<string | undefined>(initial.category);
  const [sort, setSort] = useState<SortOption>(initial.sort);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ProductQuery>(initial.filters);
  const [draft, setDraft] = useState<ProductQuery>({});
  const [draftCategory, setDraftCategory] = useState<string>();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Subscribe to the main content first so lookup requests do not take both
  // database connections ahead of the product list.
  const products = useQuery({
    queryKey: [
      "products",
      "explore",
      user?.id,
      q,
      category,
      sort,
      page,
      filters,
    ],
    queryFn: () =>
      api.products.list({
        ...filters,
        q: q || undefined,
        category_id: category,
        sort,
        page,
      }),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.tree,
    staleTime: 5 * 60_000,
  });
  const provinces = useQuery({
    queryKey: ["provinces"],
    queryFn: api.categories.provinces,
    enabled: open || !!filters.province_code,
    staleTime: 5 * 60_000,
  });
  const activeFilters =
    Object.values(filters).filter(Boolean).length + (category ? 1 : 0);
  const filterChips = [
    ...(category
      ? [
          {
            key: "category",
            label:
              (categories.data ?? [])
                .flatMap((item) => [item, ...(item.children ?? [])])
                .find((item) => item.id === category)?.name ?? "Danh mục",
          },
        ]
      : []),
    ...(filters.condition
      ? [{ key: "condition", label: CONDITION_LABELS[filters.condition] }]
      : []),
    ...(filters.province_code
      ? [
          {
            key: "province_code",
            label:
              provinces.data?.find(
                (item) => item.code === filters.province_code,
              )?.name ?? "Khu vực",
          },
        ]
      : []),
    ...(filters.delivery_method
      ? [
          {
            key: "delivery_method",
            label: deliveryLabel(filters.delivery_method),
          },
        ]
      : []),
    ...(filters.min_price
      ? [{ key: "min_price", label: "Từ " + formatVnd(filters.min_price) }]
      : []),
    ...(filters.max_price
      ? [{ key: "max_price", label: "Đến " + formatVnd(filters.max_price) }]
      : []),
  ];
  const submit = () => {
    if (input.trim().length > 100) {
      setError("Từ khóa tối đa 100 ký tự.");
      return;
    }
    setQ(input.trim());
    setPage(1);
    setError(null);
  };
  return (
    <Screen
      header={
        <MarketplaceHeader
          search={input}
          onSearchChange={setInput}
          onSearchSubmit={submit}
        />
      }
      onRefresh={() => {
        void products.refetch();
      }}
      refreshing={products.isRefetching}
    >
      <View style={[styles.card, { gap: 4, borderRadius: 16, padding: 16 }]}>
        <Text accessibilityRole="header" style={styles.title}>
          {q ? `Kết quả cho “${q}”` : "Khám phá sản phẩm"}
        </Text>
        {products.isPending ? (
          <Text style={styles.muted}>Đang tải kết quả…</Text>
        ) : products.data && (
          <Text style={styles.muted}>{products.data.meta.total} kết quả</Text>
        )}
      </View>
      <View style={[styles.row, { flexWrap: "nowrap", justifyContent: "space-between", gap: 8 }]}>
        <Button
          title={`Bộ lọc${activeFilters ? ` (${activeFilters})` : ""}`}
          icon="funnel-outline"
          secondary
          onPress={() => {
            setDraft(filters);
            setDraftCategory(category);
            setOpen(true);
            setError(null);
          }}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <SelectField
            compact
            label="Sắp xếp"
            value={sort}
            items={[
              { value: "newest", label: "Mới nhất" },
              { value: "price_asc", label: "Giá thấp đến cao" },
              { value: "price_desc", label: "Giá cao đến thấp" },
            ]}
            onChange={(value) => {
              if (
                value === "newest" ||
                value === "price_asc" ||
                value === "price_desc"
              )
                setSort(value);
              setPage(1);
            }}
          />
        </View>
      </View>
      {!open && error && <Text style={styles.error}>{error}</Text>}
      {activeFilters > 0 && (
        <View style={styles.row}>
          {filterChips.map((chip) => (
            <Pressable
              key={chip.key}
              accessibilityRole="button"
              accessibilityLabel={"Bỏ lọc " + chip.label}
              onPress={() => {
                if (chip.key === "category") setCategory(undefined);
                else
                  setFilters((current) => ({
                    ...current,
                    [chip.key]: undefined,
                  }));
                setPage(1);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                minHeight: 44,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                maxWidth: "100%",
              }}
            >
              <Text
                numberOfLines={1}
                style={[styles.meta, { flexShrink: 1, color: colors.text }]}
              >
                {chip.label}
              </Text>
              <Ionicons name="close" size={16} color={colors.muted} />
            </Pressable>
          ))}
          <Button
            title="Xóa bộ lọc"
            ghost
            onPress={() => {
              setFilters({});
              setCategory(undefined);
              setPage(1);
            }}
          />
        </View>
      )}
      {products.isPending && <ProductGridSkeleton />}
      <Feedback
        error={products.error}
        retry={() => {
          void products.refetch();
        }}
      />
      {products.data && <ProductGrid items={products.data.items} />}
      {products.data?.items.length === 0 && (
        <EmptyState
          title="Chưa có món đồ phù hợp"
          description="Thử từ khóa khác hoặc mở rộng bộ lọc."
          action={
            <Button
              title="Đặt lại tìm kiếm"
              onPress={() => {
                setInput("");
                setQ("");
                setCategory(undefined);
                setFilters({});
                setPage(1);
              }}
            />
          }
        />
      )}
      {products.data && (
        <Pagination
          page={page}
          total={products.data.meta.total}
          pageSize={products.data.meta.page_size}
          onChange={setPage}
        />
      )}
      <MarketplaceFooter />
      <Sheet
        visible={open}
        title="Bộ lọc"
        onClose={() => setOpen(false)}
        footer={
          <View style={[styles.row, { flexWrap: "nowrap" }]}>
            <View style={{ flex: 1 }}>
              <Button
                title="Đặt lại"
                secondary
                onPress={() => {
                  setDraft({});
                  setDraftCategory(undefined);
                  setError(null);
                }}
              />
            </View>
            <View style={{ flex: 2 }}>
              <Button
                title="Áp dụng bộ lọc"
                onPress={() => {
                  const problem = validateSearchFilters(draft);
                  setError(problem);
                  if (problem) return;
                  setFilters(draft);
                  setCategory(draftCategory);
                  setPage(1);
                  setOpen(false);
                }}
              />
            </View>
          </View>
        }
      >
        <Feedback
          error={provinces.error}
          retry={() => {
            void provinces.refetch();
          }}
        />
        <SelectField
          label="Danh mục"
          value={draftCategory ?? ""}
          items={[
            { value: "", label: "Tất cả danh mục" },
            ...(categories.data ?? []).flatMap((root) => [
              { value: root.id, label: root.name },
              ...(root.children ?? []).map((child) => ({
                value: child.id,
                label: `${root.name} / ${child.name}`,
              })),
            ]),
          ]}
          onChange={(value) => setDraftCategory(value || undefined)}
        />
        <Field
          label="Giá tối thiểu (VND)"
          keyboardType="number-pad"
          value={draft.min_price ?? ""}
          onChangeText={(value) =>
            setDraft({
              ...draft,
              min_price: value.replace(/\D/g, "") || undefined,
            })
          }
        />
        <Field
          label="Giá tối đa (VND)"
          keyboardType="number-pad"
          value={draft.max_price ?? ""}
          onChangeText={(value) =>
            setDraft({
              ...draft,
              max_price: value.replace(/\D/g, "") || undefined,
            })
          }
        />
        <SelectField
          label="Khu vực"
          value={draft.province_code ?? ""}
          items={[
            { value: "", label: "Tất cả tỉnh / thành" },
            ...(provinces.data ?? []).map((item) => ({
              value: item.code,
              label: item.name,
            })),
          ]}
          onChange={(value) =>
            setDraft({ ...draft, province_code: value || undefined })
          }
        />
        <SelectField
          label="Tình trạng"
          value={draft.condition ?? ""}
          items={[
            { value: "", label: "Tất cả tình trạng" },
            ...CONDITIONS.map((value) => ({
              value,
              label: CONDITION_LABELS[value],
            })),
          ]}
          onChange={(value) =>
            setDraft({
              ...draft,
              condition: CONDITIONS.find((item) => item === value),
            })
          }
        />
        <SelectField
          label="Giao nhận"
          value={draft.delivery_method ?? ""}
          items={[
            { value: "", label: "Tất cả hình thức" },
            ...DELIVERY_METHODS.map((value) => ({
              value,
              label: deliveryLabel(value),
            })),
          ]}
          onChange={(value) =>
            setDraft({
              ...draft,
              delivery_method: DELIVERY_METHODS.find((item) => item === value),
            })
          }
        />
        {error && <Text style={styles.error}>{error}</Text>}
      </Sheet>
    </Screen>
  );
}
