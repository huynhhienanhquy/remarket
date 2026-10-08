import { Prisma, PrismaClient } from "@prisma/client";
import { PROVINCES } from "@remarket/shared";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const prisma = new PrismaClient();

const PASSWORD = "remarket-demo-2026";

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const users = [
    {
      id: "00000000-0000-0000-0000-000000000001",
      fullName: "Quản trị ReMarket",
      email: "admin@remarket.vn",
      passwordHash,
      role: "ADMIN" as const,
      status: "ACTIVE" as const,
      emailVerifiedAt: new Date(Date.now() - 500 * 24 * 60 * 60 * 1000),
      provinceCode: "VN-52",
      phone: null,
      defaultAddress: null,
      joinedAt: new Date(Date.now() - 500 * 24 * 60 * 60 * 1000),
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      fullName: "Nguyễn Thị Lan",
      email: "lan.ban@remarket.vn",
      passwordHash,
      role: "USER" as const,
      status: "ACTIVE" as const,
      emailVerifiedAt: new Date(Date.now() - 420 * 24 * 60 * 60 * 1000),
      provinceCode: "VN-29",
      phone: "0900000002",
      defaultAddress: "12 Hải Phòng, Thanh Khê, Đà Nẵng",
      joinedAt: new Date(Date.now() - 420 * 24 * 60 * 60 * 1000),
    },
    {
      id: "00000000-0000-0000-0000-000000000003",
      fullName: "Trần Văn Hùng",
      email: "hung.ban@remarket.vn",
      passwordHash,
      role: "USER" as const,
      status: "ACTIVE" as const,
      emailVerifiedAt: new Date(Date.now() - 65 * 24 * 60 * 60 * 1000),
      provinceCode: "VN-01",
      phone: "0900000003",
      defaultAddress: "88 Phố Huế, Hai Bà Trưng, Hà Nội",
      joinedAt: new Date(Date.now() - 65 * 24 * 60 * 60 * 1000),
    },
    {
      id: "00000000-0000-0000-0000-000000000004",
      fullName: "Lê Minh Anh",
      email: "anh.mua@remarket.vn",
      passwordHash,
      role: "USER" as const,
      status: "ACTIVE" as const,
      emailVerifiedAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
      provinceCode: "VN-52",
      phone: "0900000004",
      defaultAddress: "45 Nguyễn Thị Minh Khai, Quận 1, TP.HCM",
      joinedAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
    },
    {
      id: "00000000-0000-0000-0000-000000000005",
      fullName: "Đỗ Thu Hà",
      email: "ha.mua@remarket.vn",
      passwordHash,
      role: "USER" as const,
      status: "ACTIVE" as const,
      emailVerifiedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      provinceCode: "VN-01",
      phone: "0900000005",
      defaultAddress: null,
      joinedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    },
    {
      id: "00000000-0000-0000-0000-000000000006",
      fullName: "Phạm Thảo Vy",
      email: "vy.moi@remarket.vn",
      passwordHash,
      role: "USER" as const,
      status: "ACTIVE" as const,
      emailVerifiedAt: null,
      provinceCode: "VN-49",
      phone: null,
      defaultAddress: null,
      joinedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
    },
    {
      id: "00000000-0000-0000-0000-000000000007",
      fullName: "Hoàng Đức Long",
      email: "long.bi.khoa@remarket.vn",
      passwordHash,
      role: "USER" as const,
      status: "LOCKED" as const,
      emailVerifiedAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
      provinceCode: "VN-50",
      phone: null,
      defaultAddress: null,
      joinedAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
      lockReason: "Đăng tin vi phạm chính sách nội dung.",
      lockedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: u,
      create: u,
    });
    console.log(`✓ User ${u.email}`);
  }

  // Categories
  const categories = [
    { id: "cat-1", parentId: null, name: "Điện tử", slug: "dien-tu", status: "ACTIVE" },
    { id: "cat-2", parentId: null, name: "Thời trang", slug: "thoi-trang", status: "ACTIVE" },
    { id: "cat-3", parentId: null, name: "Nội thất", slug: "noi-that", status: "ACTIVE" },
    { id: "cat-4", parentId: null, name: "Sách & văn phòng phẩm", slug: "sach-van-phong", status: "ACTIVE" },
    { id: "cat-5", parentId: null, name: "Xe cộ", slug: "xe-co", status: "ACTIVE" },
    { id: "cat-6", parentId: null, name: "Gia dụng", slug: "gia-dung", status: "ACTIVE" },
    { id: "cat-11", parentId: "cat-1", name: "Laptop", slug: "laptop", status: "ACTIVE" },
    { id: "cat-12", parentId: "cat-1", name: "Điện thoại", slug: "dien-thoai", status: "ACTIVE" },
    { id: "cat-13", parentId: "cat-1", name: "Âm thanh", slug: "am-thanh", status: "ACTIVE" },
    { id: "cat-14", parentId: "cat-1", name: "Phụ kiện máy tính", slug: "phu-kien-may-tinh", status: "ACTIVE" },
    { id: "cat-21", parentId: "cat-2", name: "Áo", slug: "ao", status: "ACTIVE" },
    { id: "cat-22", parentId: "cat-2", name: "Giày dép", slug: "giay-dep", status: "ACTIVE" },
    { id: "cat-31", parentId: "cat-3", name: "Bàn ghế", slug: "ban-ghe", status: "ACTIVE" },
    { id: "cat-32", parentId: "cat-3", name: "Tủ kệ", slug: "tu-ke", status: "ACTIVE" },
    { id: "cat-33", parentId: "cat-3", name: "Đèn", slug: "den", status: "ACTIVE" },
    { id: "cat-41", parentId: "cat-4", name: "Sách", slug: "sach", status: "ACTIVE" },
    { id: "cat-42", parentId: "cat-4", name: "Đồ dùng văn phòng", slug: "do-dung-van-phong", status: "INACTIVE" },
    { id: "cat-51", parentId: "cat-5", name: "Xe đạp", slug: "xe-dap", status: "ACTIVE" },
    { id: "cat-52", parentId: "cat-5", name: "Xe máy", slug: "xe-may", status: "ACTIVE" },
    { id: "cat-61", parentId: "cat-6", name: "Đồ gia dụng khác", slug: "do-gia-dung-khac", status: "ACTIVE" },
  ] satisfies Prisma.CategoryUncheckedCreateInput[];

  for (const c of categories) {
    await prisma.category.upsert({
      where: { id: c.id },
      update: c,
      create: c,
    });
  }
  console.log("✓ Categories seeded");

  // Keep the database lookup table aligned with the versioned shared dataset.
  for (const p of PROVINCES) {
    await prisma.province.upsert({
      where: { code: p.code },
      update: { name: p.name },
      create: { id: crypto.randomUUID(), ...p },
    });
  }
  console.log("✓ Provinces seeded");

  const now = new Date();
  const completedAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const productData = [
    {
      id: "10000000-0000-0000-0000-000000000001",
      sellerId: users[1]!.id,
      categoryId: "cat-11",
      title: "Laptop văn phòng đã qua sử dụng",
      description: "Máy hoạt động ổn định, phù hợp học tập và công việc văn phòng.",
      price: "8500000",
      condition: "GOOD" as const,
      usageMonths: 18,
      provinceCode: "VN-29",
      deliveryMethod: "BOTH" as const,
      shippingFee: "50000",
      status: "ACTIVE" as const,
      publishedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      reviewedBy: users[0]!.id,
      reviewedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
    },
    {
      id: "10000000-0000-0000-0000-000000000002",
      sellerId: users[2]!.id,
      categoryId: "cat-12",
      title: "Điện thoại chờ duyệt",
      description: "Tin mẫu dùng để kiểm thử hàng đợi kiểm duyệt.",
      price: "4200000",
      condition: "LIKE_NEW" as const,
      usageMonths: 8,
      provinceCode: "VN-01",
      deliveryMethod: "COD" as const,
      shippingFee: "35000",
      status: "PENDING" as const,
      publishedAt: null,
      reviewedBy: null,
      reviewedAt: null,
    },
    {
      id: "10000000-0000-0000-0000-000000000003",
      sellerId: users[1]!.id,
      categoryId: "cat-13",
      title: "Loa bluetooth đã bán",
      description: "Sản phẩm mẫu cho luồng đơn hàng hoàn tất và đánh giá.",
      price: "1200000",
      condition: "GOOD" as const,
      usageMonths: 12,
      provinceCode: "VN-29",
      deliveryMethod: "COD" as const,
      shippingFee: "30000",
      status: "SOLD" as const,
      publishedAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      reviewedBy: users[0]!.id,
      reviewedAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    },
  ] satisfies Prisma.ProductUncheckedCreateInput[];

  for (const product of productData) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: product,
      create: product,
    });
  }
  console.log("✓ Products seeded");

  const orderId = "20000000-0000-0000-0000-000000000001";
  const order = await prisma.order.upsert({
    where: { id: orderId },
    update: {
      status: "COMPLETED",
      buyerConfirmedReceived: true,
      buyerConfirmedPaid: true,
      confirmedAt: new Date(completedAt.getTime() - 4 * 24 * 60 * 60 * 1000),
      shippedAt: new Date(completedAt.getTime() - 3 * 24 * 60 * 60 * 1000),
      deliveredAt: new Date(completedAt.getTime() - 24 * 60 * 60 * 1000),
      completedAt,
    },
    create: {
      id: orderId,
      code: "RM-DEMO-0001",
      buyerId: users[3]!.id,
      sellerId: users[1]!.id,
      status: "COMPLETED",
      deliveryMethod: "COD",
      subtotal: "1200000",
      shippingFee: "30000",
      totalAmount: "1230000",
      buyerConfirmedReceived: true,
      buyerConfirmedPaid: true,
      confirmedAt: new Date(completedAt.getTime() - 4 * 24 * 60 * 60 * 1000),
      shippedAt: new Date(completedAt.getTime() - 3 * 24 * 60 * 60 * 1000),
      deliveredAt: new Date(completedAt.getTime() - 24 * 60 * 60 * 1000),
      completedAt,
      createdAt: new Date(completedAt.getTime() - 5 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.orderItem.upsert({
    where: { id: "21000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "21000000-0000-0000-0000-000000000001",
      orderId: order.id,
      productId: productData[2]!.id,
      titleSnapshot: productData[2]!.title,
      conditionSnapshot: productData[2]!.condition,
      price: productData[2]!.price,
      sortOrder: 0,
    },
  });
  await prisma.orderDeliveryInfo.upsert({
    where: { orderId: order.id },
    update: {},
    create: {
      orderId: order.id,
      method: "COD",
      recipientName: users[3]!.fullName,
      recipientPhone: users[3]!.phone!,
      deliveryAddress: users[3]!.defaultAddress!,
      carrier: "GHTK",
      trackingCode: "RMDEMO0001",
    },
  });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: order.id } });
  for (const [index, transition] of [
    { fromStatus: null, toStatus: "PENDING" as const, actorId: users[3]!.id, actorName: users[3]!.fullName },
    { fromStatus: "PENDING" as const, toStatus: "CONFIRMED" as const, actorId: users[1]!.id, actorName: users[1]!.fullName },
    { fromStatus: "CONFIRMED" as const, toStatus: "SHIPPING" as const, actorId: users[1]!.id, actorName: users[1]!.fullName },
    { fromStatus: "SHIPPING" as const, toStatus: "DELIVERED" as const, actorId: users[1]!.id, actorName: users[1]!.fullName },
    { fromStatus: "DELIVERED" as const, toStatus: "COMPLETED" as const, actorId: users[3]!.id, actorName: users[3]!.fullName },
  ].entries()) {
    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        actorType: "USER",
        actorId: transition.actorId,
        actorName: transition.actorName,
        createdAt: new Date(completedAt.getTime() - (4 - index) * 24 * 60 * 60 * 1000),
      },
    });
  }
  console.log("✓ Completed order seeded");

  await prisma.review.upsert({
    where: { orderId: order.id },
    update: {},
    create: {
      id: "30000000-0000-0000-0000-000000000001",
      orderId: order.id,
      reviewerId: users[3]!.id,
      reviewedUserId: users[1]!.id,
      productId: productData[2]!.id,
      rating: 5,
      comment: "Người bán phản hồi nhanh, sản phẩm đúng mô tả.",
      createdAt: new Date(completedAt.getTime() + 24 * 60 * 60 * 1000),
    },
  });

  const conversation = await prisma.conversation.upsert({
    where: { id: "40000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "40000000-0000-0000-0000-000000000001",
      productId: productData[0]!.id,
      buyerId: users[4]!.id,
      sellerId: users[1]!.id,
    },
  });
  await prisma.message.upsert({
    where: { id: "41000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "41000000-0000-0000-0000-000000000001",
      conversationId: conversation.id,
      senderId: users[4]!.id,
      clientMessageId: "seed-message-1",
      content: "Sản phẩm còn không bạn?",
    },
  });

  await prisma.report.upsert({
    where: { id: "50000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "50000000-0000-0000-0000-000000000001",
      targetType: "product",
      targetId: productData[1]!.id,
      targetLabel: productData[1]!.title,
      reporterId: users[4]!.id,
      targetProductId: productData[1]!.id,
      reason: "SPAM",
      description: "Báo cáo mẫu đang chờ quản trị viên xử lý.",
    },
  });

  const ticket = await prisma.supportTicket.upsert({
    where: { code: "TKT-DEMO-0001" },
    update: {},
    create: {
      id: "60000000-0000-0000-0000-000000000001",
      code: "TKT-DEMO-0001",
      userId: users[3]!.id,
      orderId: order.id,
      subject: "Cần hỗ trợ về đơn mẫu",
      type: "ORDER_PROBLEM",
      status: "RESOLVED",
      assignedAdminId: users[0]!.id,
      resolutionNote: "Đã đối chiếu và xác nhận đơn hoàn tất bình thường.",
      resolvedAt: completedAt,
    },
  });
  await prisma.supportMessage.upsert({
    where: { id: "61000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "61000000-0000-0000-0000-000000000001",
      ticketId: ticket.id,
      senderId: users[3]!.id,
      role: "USER",
      message: "Nhờ kiểm tra trạng thái giao hàng giúp tôi.",
    },
  });
  console.log("✓ Chat, review, report and support seeded");

  console.log("\n✅ Seed complete! Demo accounts:");
  console.log("  admin@remarket.vn / remarket-demo-2026 (ADMIN)");
  console.log("  lan.ban@remarket.vn / remarket-demo-2026 (SELLER)");
  console.log("  hung.ban@remarket.vn / remarket-demo-2026 (SELLER)");
  console.log("  anh.mua@remarket.vn / remarket-demo-2026 (BUYER/SELLER)");
  console.log("  ha.mua@remarket.vn / remarket-demo-2026 (BUYER)");
  console.log("  vy.moi@remarket.vn / remarket-demo-2026 (UNVERIFIED EMAIL)");
  console.log("  long.bi.khoa@remarket.vn / remarket-demo-2026 (LOCKED)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
