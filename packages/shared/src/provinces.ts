/**
 * Versioned geography dataset used until the API publishes its own
 * (ui-spec 25 point 8: no hardcoded codes outside a versioned set).
 *
 * Codes are ISO 3166-2:VN subdivision identifiers from the dataset shipped
 * with the mock adapter; a live deployment must read them from the API.
 */
export interface Province {
  code: string;
  name: string;
}

export const GEO_DATASET_VERSION = "mock-2026-01";

export const PROVINCES: Province[] = [
  { code: "VN-01", name: "Hà Nội" },
  { code: "VN-02", name: "Cao Bằng" },
  { code: "VN-04", name: "Lào Cai" },
  { code: "VN-06", name: "Bắc Giang" },
  { code: "VN-08", name: "Tuyên Quang" },
  { code: "VN-11", name: "Quảng Ninh" },
  { code: "VN-12", name: "Hải Dương" },
  { code: "VN-14", name: "Hải Phòng" },
  { code: "VN-15", name: "Bắc Ninh" },
  { code: "VN-18", name: "Hưng Yên" },
  { code: "VN-19", name: "Thái Bình" },
  { code: "VN-20", name: "Nam Định" },
  { code: "VN-22", name: "Thanh Hóa" },
  { code: "VN-23", name: "Nghệ An" },
  { code: "VN-25", name: "Hà Tĩnh" },
  { code: "VN-26", name: "Quảng Bình" },
  { code: "VN-27", name: "Quảng Trị" },
  { code: "VN-28", name: "Thừa Thiên Huế" },
  { code: "VN-29", name: "Đà Nẵng" },
  { code: "VN-30", name: "Quảng Nam" },
  { code: "VN-31", name: "Quảng Ngãi" },
  { code: "VN-32", name: "Bình Định" },
  { code: "VN-33", name: "Phú Yên" },
  { code: "VN-34", name: "Khánh Hòa" },
  { code: "VN-35", name: "Ninh Thuận" },
  { code: "VN-36", name: "Bình Thuận" },
  { code: "VN-37", name: "Kon Tum" },
  { code: "VN-38", name: "Gia Lai" },
  { code: "VN-39", name: "Đắk Lắk" },
  { code: "VN-40", name: "Đắk Nông" },
  { code: "VN-41", name: "Lâm Đồng" },
  { code: "VN-43", name: "Bình Phước" },
  { code: "VN-44", name: "Tây Ninh" },
  { code: "VN-45", name: "Bình Dương" },
  { code: "VN-46", name: "Đồng Nai" },
  { code: "VN-47", name: "Long An" },
  { code: "VN-49", name: "Đồng Tháp" },
  { code: "VN-50", name: "An Giang" },
  { code: "VN-51", name: "Bà Rịa - Vũng Tàu" },
  { code: "VN-52", name: "Hồ Chí Minh" },
  { code: "VN-53", name: "Tiền Giang" },
  { code: "VN-54", name: "Bến Tre" },
  { code: "VN-55", name: "Trà Vinh" },
  { code: "VN-56", name: "Vĩnh Long" },
  { code: "VN-57", name: "Cần Thơ" },
  { code: "VN-58", name: "Hậu Giang" },
  { code: "VN-59", name: "Sóc Trăng" },
  { code: "VN-60", name: "Bạc Liêu" },
  { code: "VN-61", name: "Cà Mau" },
];

export function provinceLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const found = PROVINCES.find((p) => p.code === code);
  return found?.name ?? null;
}