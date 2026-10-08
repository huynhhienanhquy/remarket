import type {
  AuditLogItem,
  Notification,
  OrderStatusHistoryEntry,
} from "@remarket/shared";
import { IDS, ago, daysAgo, ahead, orderCode } from "./time";

const LONG_TITLE_LABEL =
  "Bán nhanh bàn phím cơ Keychron K2 phiên bản phím LED trắng, đã thay keycap PBT";

import type {
  Database,
  MockConversation,
  MockMessage,
  MockOrder,
  MockReport,
  MockReview,
  MockTicket,
} from "./types";

/**
 * Transactional fixtures (ui-spec 27): one order per status for COD and
 * MEETUP, a multi-item order, an expired PENDING order, chats, an open order
 * ticket that blocks completion, reviews including a hidden one, reports and
 * audit entries. Reservation links between orders and products are set here so
 * `status = RESERVED <=> reserved_order_id` always holds.
 */

interface Step {
  status: MockOrder["status"];
  at: string;
  actor_type: "USER" | "ADMIN" | "SYSTEM";
  actor_name: string | null;
  reason?: string;
}

interface OrderSeed {
  index: number;
  buyer: number;
  seller: number;
  products: number[];
  method: "COD" | "MEETUP";
  status: MockOrder["status"];
  created: string;
  expires?: string;
  delivery: { name: string; phone: string; address: string };
  carrier?: string;
  tracking?: string;
  cancelled_by?: number;
  steps: Step[];
}

export function buildTransactionFixtures(db: Database): Database {
  const findProduct = (index: number) => {
    const entry = db.products.find((item) => item.id === IDS.product(index));
    if (!entry) throw new Error(`Missing fixture product ${index}`);
    return entry;
  };
  const findUser = (index: number) => {
    const entry = db.users.find((item) => item.id === IDS.user(index));
    if (!entry) throw new Error(`Missing fixture user ${index}`);
    return entry;
  };

  const makeOrder = (seed: OrderSeed): MockOrder => {
    const id = IDS.order(seed.index);
    const refs = seed.products.map(findProduct);
    const items = refs.map((entry, position) => ({
      id: `${id}-item-${position}`,
      product_id: entry.id,
      title_snapshot: entry.title,
      condition_snapshot: entry.condition,
      image_path_snapshot: entry.images[0]?.url ?? null,
      image_url: entry.images[0]?.url ?? null,
      price: entry.price,
    }));
    const subtotal = items
      .reduce((sum, item) => sum + BigInt(item.price), 0n)
      .toString();
    const shipping =
      seed.method === "MEETUP"
        ? "0"
        : refs
            .reduce(
              (max, entry) => (BigInt(entry.shipping_fee) > BigInt(max) ? entry.shipping_fee : max),
              "0",
            )
            .toString();

    let previous: MockOrder["status"] | null = null;
    const status_history: OrderStatusHistoryEntry[] = seed.steps.map((step) => {
      const entry: OrderStatusHistoryEntry = {
        from_status: previous,
        to_status: step.status,
        actor_type: step.actor_type,
        actor_name: step.actor_name,
        reason: step.reason ?? null,
        created_at: step.at,
      };
      previous = step.status;
      return entry;
    });

    const at = (status: MockOrder["status"]) =>
      seed.steps.find((step) => step.status === status)?.at ?? null;

    return {
      id,
      code: orderCode(id),
      checkout_request_id: IDS.checkout(seed.index),
      buyer_id: findUser(seed.buyer).id,
      seller_id: findUser(seed.seller).id,
      subtotal,
      shipping_fee: shipping,
      total_amount: (BigInt(subtotal) + BigInt(shipping)).toString(),
      currency: "VND",
      delivery_method: seed.method,
      delivery: {
        recipient_name: seed.delivery.name,
        recipient_phone: seed.delivery.phone,
        delivery_address: seed.delivery.address,
        carrier: seed.carrier ?? null,
        tracking_code: seed.tracking ?? null,
      },
      status: seed.status,
      version: seed.steps.length,
      expires_at: seed.expires ?? null,
      confirmed_at: at("CONFIRMED"),
      shipped_at: at("SHIPPING"),
      delivered_at: at("DELIVERED"),
      completed_at: at("COMPLETED"),
      cancelled_at: at("CANCELLED"),
      cancelled_by: seed.cancelled_by ? findUser(seed.cancelled_by).id : null,
      cancellation_reason:
        seed.steps.find((step) => step.status === "CANCELLED")?.reason ?? null,
      created_at: seed.created,
      updated_at: seed.steps.at(-1)?.at ?? seed.created,
      items,
      status_history,
    };
  };

  const buyerName = "Lê Minh Anh";
  const buyerPhone = "0900000004";
  const buyerAddress = "45 Nguyễn Thị Minh Khai, Quận 1, TP.HCM";
  const haName = "Đỗ Thu Hà";
  const haPhone = "0900000005";

  db.orders = [
    makeOrder({
      index: 1,
      buyer: 4,
      seller: 2,
      products: [17, 12],
      method: "COD",
      status: "PENDING",
      created: ago(120),
      expires: ahead(1140),
      delivery: { name: buyerName, phone: buyerPhone, address: buyerAddress },
      steps: [
        { status: "PENDING", at: ago(120), actor_type: "USER", actor_name: buyerName },
      ],
    }),
    makeOrder({
      index: 2,
      buyer: 4,
      seller: 3,
      products: [2],
      method: "MEETUP",
      status: "CONFIRMED",
      created: daysAgo(2),
      delivery: {
        name: buyerName,
        phone: buyerPhone,
        address: "Điểm gặp: Sách Coffee 12 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội",
      },
      steps: [
        { status: "PENDING", at: daysAgo(2), actor_type: "USER", actor_name: buyerName },
        { status: "CONFIRMED", at: daysAgo(1), actor_type: "USER", actor_name: "Trần Văn Hùng" },
      ],
    }),
    makeOrder({
      index: 3,
      buyer: 4,
      seller: 2,
      products: [8],
      method: "COD",
      status: "SHIPPING",
      created: daysAgo(4),
      delivery: { name: buyerName, phone: buyerPhone, address: buyerAddress },
      carrier: "Chuyển phát nhanh nội thành",
      tracking: "VN984512037",
      steps: [
        { status: "PENDING", at: daysAgo(4), actor_type: "USER", actor_name: buyerName },
        { status: "CONFIRMED", at: daysAgo(3), actor_type: "USER", actor_name: "Nguyễn Thị Lan" },
        { status: "SHIPPING", at: ago(600), actor_type: "USER", actor_name: "Nguyễn Thị Lan" },
      ],
    }),
    makeOrder({
      index: 4,
      buyer: 4,
      seller: 3,
      products: [14],
      method: "COD",
      status: "DELIVERED",
      created: daysAgo(6),
      delivery: { name: buyerName, phone: buyerPhone, address: buyerAddress },
      carrier: "Giao hàng nhanh",
      tracking: "GHN220945118",
      steps: [
        { status: "PENDING", at: daysAgo(6), actor_type: "USER", actor_name: buyerName },
        { status: "CONFIRMED", at: daysAgo(5), actor_type: "USER", actor_name: "Trần Văn Hùng" },
        { status: "SHIPPING", at: daysAgo(4), actor_type: "USER", actor_name: "Trần Văn Hùng" },
        { status: "DELIVERED", at: ago(300), actor_type: "USER", actor_name: buyerName },
      ],
    }),
    makeOrder({
      index: 5,
      buyer: 4,
      seller: 2,
      products: [15],
      method: "COD",
      status: "COMPLETED",
      created: daysAgo(46),
      delivery: { name: buyerName, phone: buyerPhone, address: buyerAddress },
      steps: [
        { status: "PENDING", at: daysAgo(46), actor_type: "USER", actor_name: buyerName },
        { status: "CONFIRMED", at: daysAgo(45), actor_type: "USER", actor_name: "Nguyễn Thị Lan" },
        { status: "SHIPPING", at: daysAgo(44), actor_type: "USER", actor_name: "Nguyễn Thị Lan" },
        { status: "DELIVERED", at: daysAgo(42), actor_type: "USER", actor_name: buyerName },
        { status: "COMPLETED", at: daysAgo(40), actor_type: "USER", actor_name: buyerName },
      ],
    }),
    makeOrder({
      index: 6,
      buyer: 4,
      seller: 3,
      products: [16],
      method: "COD",
      status: "COMPLETED",
      created: daysAgo(6),
      delivery: { name: buyerName, phone: buyerPhone, address: buyerAddress },
      steps: [
        { status: "PENDING", at: daysAgo(6), actor_type: "USER", actor_name: buyerName },
        { status: "CONFIRMED", at: daysAgo(5), actor_type: "USER", actor_name: "Trần Văn Hùng" },
        { status: "SHIPPING", at: daysAgo(4), actor_type: "USER", actor_name: "Trần Văn Hùng" },
        { status: "DELIVERED", at: daysAgo(4), actor_type: "USER", actor_name: buyerName },
        { status: "COMPLETED", at: daysAgo(3), actor_type: "USER", actor_name: buyerName },
      ],
    }),
    makeOrder({
      index: 7,
      buyer: 4,
      seller: 2,
      products: [1],
      method: "COD",
      status: "CANCELLED",
      created: daysAgo(5),
      delivery: { name: buyerName, phone: buyerPhone, address: buyerAddress },
      cancelled_by: 4,
      steps: [
        { status: "PENDING", at: daysAgo(5), actor_type: "USER", actor_name: buyerName },
        {
          status: "CANCELLED",
          at: daysAgo(2),
          actor_type: "USER",
          actor_name: buyerName,
          reason:
            "Người bán báo món đồ đã có người mua trực tiếp, hai bên thống nhất hủy đơn.",
        },
      ],
    }),
    makeOrder({
      index: 8,
      buyer: 4,
      seller: 2,
      products: [18],
      method: "COD",
      status: "PENDING",
      created: ago(1500),
      expires: ago(60),
      delivery: { name: buyerName, phone: buyerPhone, address: buyerAddress },
      steps: [
        { status: "PENDING", at: ago(1500), actor_type: "USER", actor_name: buyerName },
      ],
    }),
    makeOrder({
      index: 9,
      buyer: 5,
      seller: 4,
      products: [25],
      method: "MEETUP",
      status: "PENDING",
      created: ago(40),
      expires: ahead(1400),
      delivery: {
        name: haName,
        phone: haPhone,
        address: "Điểm gặp: Bến xe Mỹ Đình, Nam Từ Liêm, Hà Nội",
      },
      steps: [{ status: "PENDING", at: ago(40), actor_type: "USER", actor_name: haName }],
    }),
    makeOrder({
      index: 10,
      buyer: 5,
      seller: 4,
      products: [26],
      method: "MEETUP",
      status: "COMPLETED",
      created: daysAgo(16),
      delivery: {
        name: haName,
        phone: haPhone,
        address: "Điểm gặp: Cà phê Cộng 35 Lý Quốc Khánh, Hà Nội",
      },
      steps: [
        { status: "PENDING", at: daysAgo(16), actor_type: "USER", actor_name: haName },
        { status: "CONFIRMED", at: daysAgo(15), actor_type: "USER", actor_name: buyerName },
        { status: "DELIVERED", at: daysAgo(11), actor_type: "USER", actor_name: haName },
        { status: "COMPLETED", at: daysAgo(10), actor_type: "USER", actor_name: haName },
      ],
    }),
    makeOrder({
      index: 11,
      buyer: 5,
      seller: 3,
      products: [10],
      method: "MEETUP",
      status: "PENDING",
      created: ago(60),
      expires: ahead(1380),
      delivery: {
        name: haName,
        phone: haPhone,
        address: "Điểm gặp: Siêu thị BigC Hà Đông, Hà Nội",
      },
      steps: [{ status: "PENDING", at: ago(60), actor_type: "USER", actor_name: haName }],
    }),
    makeOrder({
      index: 12,
      buyer: 5,
      seller: 3,
      products: [7],
      method: "MEETUP",
      status: "COMPLETED",
      created: daysAgo(30),
      delivery: {
        name: haName,
        phone: haPhone,
        address: "Điểm gặp: Công viên Lê Văn Luông, Đà Nẵng",
      },
      steps: [
        { status: "PENDING", at: daysAgo(30), actor_type: "USER", actor_name: haName },
        { status: "CONFIRMED", at: daysAgo(29), actor_type: "USER", actor_name: "Trần Văn Hùng" },
        { status: "DELIVERED", at: daysAgo(21), actor_type: "USER", actor_name: haName },
        { status: "COMPLETED", at: daysAgo(20), actor_type: "USER", actor_name: haName },
      ],
    }),
    makeOrder({
      index: 13,
      buyer: 5,
      seller: 2,
      products: [19],
      method: "COD",
      status: "COMPLETED",
      created: daysAgo(28),
      delivery: { name: haName, phone: haPhone, address: "15 Trần Duy Hưng, Cầu Giấy, Hà Nội" },
      steps: [
        { status: "PENDING", at: daysAgo(28), actor_type: "USER", actor_name: haName },
        { status: "CONFIRMED", at: daysAgo(27), actor_type: "USER", actor_name: "Nguyễn Thị Lan" },
        { status: "SHIPPING", at: daysAgo(26), actor_type: "USER", actor_name: "Nguyễn Thị Lan" },
        { status: "DELIVERED", at: daysAgo(25), actor_type: "USER", actor_name: haName },
        { status: "COMPLETED", at: daysAgo(25), actor_type: "USER", actor_name: haName },
      ],
    }),
    makeOrder({
      index: 14,
      buyer: 7,
      seller: 2,
      products: [20],
      method: "COD",
      status: "COMPLETED",
      created: daysAgo(55),
      delivery: { name: "Hoàng Đức Long", phone: "0900000007", address: "9 Lê Lợi, Vũng Tàu" },
      steps: [
        { status: "PENDING", at: daysAgo(55), actor_type: "USER", actor_name: "Hoàng Đức Long" },
        { status: "CONFIRMED", at: daysAgo(54), actor_type: "USER", actor_name: "Nguyễn Thị Lan" },
        { status: "SHIPPING", at: daysAgo(53), actor_type: "USER", actor_name: "Nguyễn Thị Lan" },
        { status: "DELIVERED", at: daysAgo(51), actor_type: "USER", actor_name: "Hoàng Đức Long" },
        { status: "COMPLETED", at: daysAgo(50), actor_type: "USER", actor_name: "Hoàng Đức Long" },
      ],
    }),
    makeOrder({
      index: 15,
      buyer: 5,
      seller: 2,
      products: [28],
      method: "COD",
      status: "COMPLETED",
      created: daysAgo(34),
      delivery: { name: haName, phone: haPhone, address: "15 Trần Duy Hưng, Cầu Giấy, Hà Nội" },
      steps: [
        { status: "PENDING", at: daysAgo(34), actor_type: "USER", actor_name: haName },
        { status: "CONFIRMED", at: daysAgo(33), actor_type: "USER", actor_name: "Nguyễn Thị Lan" },
        { status: "SHIPPING", at: daysAgo(32), actor_type: "USER", actor_name: "Nguyễn Thị Lan" },
        { status: "DELIVERED", at: daysAgo(31), actor_type: "USER", actor_name: haName },
        { status: "COMPLETED", at: daysAgo(31), actor_type: "USER", actor_name: haName },
      ],
    }),
  ];

  /* Product ↔ reservation links (detail-project 6.3 / 13.3 CHECK). */
  const reservations: Record<number, number> = {
    17: 1,
    12: 1,
    2: 2,
    8: 3,
    14: 4,
    18: 8,
    25: 9,
    10: 11,
  };
  for (const [productIndex, orderIndex] of Object.entries(reservations)) {
    const entry = findProduct(Number(productIndex));
    entry.status = "RESERVED";
    entry.reserved_order_id = IDS.order(orderIndex);
    entry.updated_at = ago(120);
  }

  /* Conversations: one open chat with unread messages, one fully read. */
  const conversations: MockConversation[] = [
    {
      id: IDS.conversation(1),
      product_id: IDS.product(1),
      buyer_id: IDS.user(4),
      seller_id: IDS.user(2),
      created_at: daysAgo(3),
      updated_at: ago(45),
    },
    {
      id: IDS.conversation(2),
      product_id: IDS.product(2),
      buyer_id: IDS.user(4),
      seller_id: IDS.user(3),
      created_at: daysAgo(2),
      updated_at: daysAgo(1),
    },
  ];

  const messageSeeds: Array<{
    conversation: number;
    index: number;
    sender: number;
    content: string;
    at: string;
    read_at?: string | null;
  }> = [
    { conversation: 1, index: 1, sender: 4, content: "Chào anh, bàn phím này còn không ạ?", at: daysAgo(3), read_at: daysAgo(3) },
    { conversation: 1, index: 2, sender: 2, content: "Chào em, còn nhé. Em xem mô tả giúp anh nha.", at: daysAgo(3), read_at: daysAgo(3) },
    { conversation: 1, index: 3, sender: 4, content: "Anh cho em xin thêm ảnh mặt phím được không?", at: daysAgo(2), read_at: daysAgo(2) },
    { conversation: 1, index: 4, sender: 2, content: "Đây em, ảnh chụp thật do anh chụp tại nhà.", at: ago(180), read_at: ago(170) },
    { conversation: 1, index: 5, sender: 4, content: "Em chốt tối nay qua lấy được không anh?", at: ago(90), read_at: ago(85) },
    { conversation: 1, index: 6, sender: 2, content: "Được em, 19h ở quán cà phê góc đường nhé. Anh giữ máy cho em tới tối.", at: ago(45) },
    { conversation: 2, index: 7, sender: 4, content: "Anh ơi tai nghe còn warranty không?", at: daysAgo(2), read_at: daysAgo(2) },
    { conversation: 2, index: 8, sender: 3, content: "Hết warranty rồi em ạ, hàng nhập về đã hơn một năm.", at: daysAgo(2), read_at: daysAgo(2) },
    { conversation: 2, index: 9, sender: 4, content: "Dạ em cảm ơn anh.", at: daysAgo(2), read_at: daysAgo(1) },
    { conversation: 2, index: 10, sender: 3, content: "Nhắn anh khi nào qua xem nhé.", at: daysAgo(1), read_at: daysAgo(1) },
  ];

  const messages: MockMessage[] = messageSeeds.map((seed) => ({
    id: IDS.message(seed.index),
    conversation_id: IDS.conversation(seed.conversation),
    sender_id: IDS.user(seed.sender),
    client_message_id: `fixture-${seed.index}`,
    content: seed.content,
    read_at: seed.read_at ?? null,
    created_at: seed.at,
  }));

  const notifications: Notification[] = [
    {
      id: IDS.notification(1),
      user_id: IDS.user(4),
      type: "PRODUCT_REJECTED",
      title: "Tin đăng bị từ chối",
      content: "Tủ sách 4 tầng chưa đạt yêu cầu về hình ảnh. Bạn có thể chỉnh sửa và gửi lại.",
      reference_type: "product",
      reference_id: IDS.product(23),
      read_at: null,
      created_at: ago(1400),
    },
    {
      id: IDS.notification(2),
      user_id: IDS.user(4),
      type: "ORDER_CONFIRMED",
      title: "Người bán đã xác nhận đơn",
      content: "Đơn gặp trực tiếp với Trần Văn Hùng đã được xác nhận.",
      reference_type: "order",
      reference_id: IDS.order(2),
      read_at: daysAgo(1),
      created_at: daysAgo(1),
    },
    {
      id: IDS.notification(3),
      user_id: IDS.user(4),
      type: "NEW_MESSAGE",
      title: "Tin nhắn mới từ Nguyễn Thị Lan",
      content: "Được em, 19h ở quán cà phê góc đường nhé. Anh giữ máy cho em tới tối.",
      reference_type: "conversation",
      reference_id: IDS.conversation(1),
      read_at: null,
      created_at: ago(45),
    },
    {
      id: IDS.notification(4),
      user_id: IDS.user(4),
      type: "ORDER_COMPLETED",
      title: "Đơn hàng đã hoàn tất",
      content: "Cảm ơn bạn đã xác nhận hoàn tất đơn Micro Rode NT-USB Mini.",
      reference_type: "order",
      reference_id: IDS.order(5),
      read_at: daysAgo(40),
      created_at: daysAgo(40),
    },
    {
      id: IDS.notification(5),
      user_id: IDS.user(4),
      type: "TICKET_REPLY",
      title: "Phản hồi từ Trung tâm hỗ trợ",
      content: "Chúng tôi đã liên hệ người bán và đang chờ phản hồi.",
      reference_type: "ticket",
      reference_id: IDS.ticket(1),
      read_at: null,
      created_at: ago(240),
    },
    {
      id: IDS.notification(6),
      user_id: IDS.user(4),
      type: "PRODUCT_APPROVED",
      title: "Tin đăng đã được duyệt",
      content: "Ổ cứng SSD Samsung 980 1TB đang hiển thị cho người mua.",
      reference_type: "product",
      reference_id: IDS.product(21),
      read_at: daysAgo(5),
      created_at: daysAgo(5),
    },
  ];

  const tickets: MockTicket[] = [
    {
      id: IDS.ticket(1),
      code: "SUP-4K7Q2M19",
      user_id: IDS.user(4),
      order_id: IDS.order(4),
      assigned_admin_id: IDS.user(1),
      assigned_admin_name: "Quản trị ReMarket",
      subject: "Nhận hàng nhưng tivi không lên nguồn",
      type: "ORDER_PROBLEM",
      status: "OPEN",
      resolution_note: null,
      resolved_at: null,
      closed_at: null,
      created_at: ago(280),
      updated_at: ago(200),
      messages: [
        {
          id: `${IDS.ticket(1)}-m1`,
          sender: { id: IDS.user(4), name: "Lê Minh Anh", role: "USER" },
          message:
            "Tôi nhận tivi hôm qua nhưng máy không lên nguồn. Mong hỗ trợ xử lý, tôi đã thử đổi ổ điện và remote.",
          created_at: ago(280),
        },
        {
          id: `${IDS.ticket(1)}-m2`,
          sender: { id: IDS.user(1), name: "Quản trị ReMarket", role: "ADMIN" },
          message: "Chúng tôi đã liên hệ người bán và đang chờ phản hồi. Bạn vui lòng giữ nguyên hiện trạng hàng.",
          created_at: ago(240),
        },
        {
          id: `${IDS.ticket(1)}-m3`,
          sender: { id: IDS.user(4), name: "Lê Minh Anh", role: "USER" },
          message: "Dạ cảm ơn anh/chị, tôi sẽ quay video test gửi sau.",
          created_at: ago(200),
        },
      ],
    },
    {
      id: IDS.ticket(2),
      code: "SUP-8W3D6T02",
      user_id: IDS.user(4),
      order_id: null,
      assigned_admin_id: IDS.user(1),
      assigned_admin_name: "Quản trị ReMarket",
      subject: "Không nhận được email xác minh tài khoản",
      type: "ACCOUNT",
      status: "RESOLVED",
      resolution_note:
        "Đã gửi lại link xác minh và hướng dẫn kiểm tra thư rác. Bạn đăng nhập rồi chọn gửi lại để nhận email mới.",
      resolved_at: ago(500),
      closed_at: null,
      created_at: ago(600),
      updated_at: ago(500),
      messages: [
        {
          id: `${IDS.ticket(2)}-m1`,
          sender: { id: IDS.user(4), name: "Lê Minh Anh", role: "USER" },
          message: "Tôi đăng ký nhưng chưa nhận được email xác minh.",
          created_at: ago(600),
        },
        {
          id: `${IDS.ticket(2)}-m2`,
          sender: { id: IDS.user(1), name: "Quản trị ReMarket", role: "ADMIN" },
          message:
            "Đã gửi lại link xác minh và hướng dẫn kiểm tra thư rác. Bạn đăng nhập rồi chọn gửi lại để nhận email mới.",
          created_at: ago(500),
        },
      ],
    },
    {
      id: IDS.ticket(3),
      code: "SUP-2F9R5B73",
      user_id: IDS.user(4),
      order_id: null,
      assigned_admin_id: null,
      assigned_admin_name: null,
      subject: "Phí giao hàng được tính thế nào?",
      type: "PRODUCT",
      status: "CLOSED",
      resolution_note: "Đã giải đáp: phí ship là phí cố định trên tin đăng, đơn nhiều món lấy mức cao nhất.",
      resolved_at: daysAgo(7),
      closed_at: daysAgo(6),
      created_at: daysAgo(8),
      updated_at: daysAgo(6),
      messages: [
        {
          id: `${IDS.ticket(3)}-m1`,
          sender: { id: IDS.user(4), name: "Lê Minh Anh", role: "USER" },
          message: "Nếu mua nhiều món của cùng người bán thì phí ship tính sao anh/chị?",
          created_at: daysAgo(8),
        },
        {
          id: `${IDS.ticket(3)}-m2`,
          sender: { id: IDS.user(1), name: "Quản trị ReMarket", role: "ADMIN" },
          message: "Đơn COD lấy mức phí cao nhất trong các món của đơn, bạn nhé.",
          created_at: daysAgo(7),
        },
      ],
    },
  ];

  const reports: MockReport[] = [    {
      id: IDS.report(1),
      target_type: "product",
      target_id: IDS.product(9),
      target_label: LONG_TITLE_LABEL,
      reason: "SPAM",
      description: "Tin đăng này xuất hiện nhiều lần trong ngày với nội dung gần giống nhau.",
      status: "PENDING",
      resolution_note: null,
      reporter_id: IDS.user(4),
      handled_by: null,
      handled_at: null,
      created_at: ago(300),
      updated_at: ago(300),
    },
    {
      id: IDS.report(2),
      target_type: "user",
      target_id: IDS.user(7),
      target_label: "Hoàng Đức Long",
      reason: "HARASSMENT",
      description: "Có lời lẽ không phù hợp khi trao đổi trong tin nhắn.",
      status: "RESOLVED",
      resolution_note: "Đã khóa tài khoản và gỡ tin vi phạm sau khi xác minh.",
      reporter_id: IDS.user(4),
      handled_by: IDS.user(1),
      handled_at: daysAgo(4),
      created_at: daysAgo(5),
      updated_at: daysAgo(4),
    },
  ];

  // Reviews are stored with ids only; the adapter projects reviewer summaries.
  const reviewSeeds: Array<{
    index: number;
    order: number;
    reviewer: number;
    reviewed: number;
    rating: number;
    comment: string;
    at: string;
    hidden?: { at: string; reason: string };
  }> = [
    {
      index: 1,
      order: 5,
      reviewer: 4,
      reviewed: 2,
      rating: 5,
      comment: "Đóng gói cẩn thận, micro đúng mô tả, người bán phản hồi nhanh.",
      at: daysAgo(38),
    },
    {
      index: 2,
      order: 13,
      reviewer: 5,
      reviewed: 2,
      rating: 5,
      comment: "Giao hàng nhanh, bàn chắc chắn, đóng gói kỹ.",
      at: daysAgo(24),
    },
    {
      index: 3,
      order: 14,
      reviewer: 7,
      reviewed: 2,
      rating: 4,
      comment: "Sản phẩm dùng tốt, thiếu sách hướng dẫn.",
      at: daysAgo(49),
    },
    {
      index: 4,
      order: 15,
      reviewer: 5,
      reviewed: 2,
      rating: 1,
      comment: "Bình luận vi phạm quy tắc cộng đồng, đã bị quản trị ẩn.",
      at: daysAgo(30),
      hidden: { at: daysAgo(20), reason: "Nội dung công kích cá nhân, vi phạm quy tắc cộng đồng." },
    },
    {
      index: 5,
      order: 10,
      reviewer: 5,
      reviewed: 4,
      rating: 4,
      comment: "Người bán phản hồi nhanh, máy đúng mô tả.",
      at: daysAgo(9),
    },
  ];

  const mockReviews: MockReview[] = reviewSeeds.map((seed) => {
    const reviewer = findUser(seed.reviewer);
    const reviewed = findUser(seed.reviewed);
    return {
      id: IDS.review(seed.index),
      order_id: IDS.order(seed.order),
      reviewer_id: reviewer.id,
      reviewed_user_id: reviewed.id,
      rating: seed.rating,
      comment: seed.comment,
      created_at: seed.at,
      hidden_at: seed.hidden?.at ?? null,
      hidden_reason: seed.hidden?.reason ?? null,
      reviewer: { id: reviewer.id, name: reviewer.full_name, avatar_url: reviewer.avatar_url },
    };
  });

  const audit_logs: AuditLogItem[] = [
    {
      id: "0000000a-0000-4000-8000-000000000001",
      actor_name: "Quản trị ReMarket",
      actor_type: "ADMIN",
      action: "product.approve",
      entity_type: "product",
      entity_id: IDS.product(21),
      reason: null,
      metadata: { version: 1 },
      created_at: daysAgo(5),
    },
    {
      id: "0000000a-0000-4000-8000-000000000002",
      actor_name: "Quản trị ReMarket",
      actor_type: "ADMIN",
      action: "product.block",
      entity_type: "product",
      entity_id: IDS.product(13),
      reason: "Mô tả thiếu thông tin nguồn gốc hàng hóa.",
      metadata: {},
      created_at: daysAgo(14),
    },
    {
      id: "0000000a-0000-4000-8000-000000000003",
      actor_name: "Quản trị ReMarket",
      actor_type: "ADMIN",
      action: "user.lock",
      entity_type: "user",
      entity_id: IDS.user(7),
      reason: "Đăng tin vi phạm chính sách nội dung.",
      metadata: { status: "LOCKED" },
      created_at: daysAgo(4),
    },
    {
      id: "0000000a-0000-4000-8000-000000000004",
      actor_name: "Quản trị ReMarket",
      actor_type: "ADMIN",
      action: "report.resolve",
      entity_type: "report",
      entity_id: IDS.report(2),
      reason: "Đã khóa tài khoản và gỡ tin vi phạm sau khi xác minh.",
      metadata: { action: "lock_user" },
      created_at: daysAgo(4),
    },
    {
      id: "0000000a-0000-4000-8000-000000000005",
      actor_name: "Quản trị ReMarket",
      actor_type: "ADMIN",
      action: "category.disable",
      entity_type: "category",
      entity_id: IDS.category(42),
      reason: "Ngừng sử dụng nhóm danh mục này.",
      metadata: { status: "INACTIVE" },
      created_at: daysAgo(30),
    },
  ];

  db.conversations = conversations;
  db.messages = messages;
  db.notifications = notifications;
  db.tickets = tickets;
  db.reports = reports;
  db.reviews = mockReviews;
  db.audit_logs = audit_logs;
  for (const entry of db.audit_logs) entry.actor_id = IDS.user(1);
  return db;
}
