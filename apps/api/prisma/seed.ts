/**
 * Seed — base system data + demo store.
 * Run: npm run prisma:seed -w apps/api   (idempotent)
 */
import { PrismaClient, Prisma, IncomePart, PaymentMethod } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  MODULE_REGISTRY,
  PERMISSIONS,
  PERMISSION_MODULES,
  PLANS,
  ROLE_PERMISSIONS,
  ROLES,
  SYSTEM_ROLE_NAMES,
  RoleKey,
} from '@my-store/shared';

const prisma = new PrismaClient();
const D = (v: number | string) => new Prisma.Decimal(v);

async function seedPermissions() {
  for (const key of Object.values(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, moduleKey: PERMISSION_MODULES[key] },
      update: { moduleKey: PERMISSION_MODULES[key] },
    });
  }
}

async function seedSystemRoles() {
  const permissions = await prisma.permission.findMany();
  const permissionByKey = new Map(permissions.map((p) => [p.key, p.id]));

  for (const key of Object.values(ROLES)) {
    let role = await prisma.role.findFirst({ where: { tenantId: null, key } });
    if (!role) {
      role = await prisma.role.create({
        data: { tenantId: null, key, name: SYSTEM_ROLE_NAMES[key as RoleKey], isSystem: true },
      });
    }
    const wanted = ROLE_PERMISSIONS[key as RoleKey].map((p) => permissionByKey.get(p)!);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (wanted.length) {
      await prisma.rolePermission.createMany({
        data: wanted.map((permissionId) => ({ roleId: role!.id, permissionId })),
      });
    }
  }
}

async function seedPlans() {
  for (const plan of PLANS) {
    const priceYearly = plan.priceYearly != null ? D(plan.priceYearly) : null;
    await prisma.plan.upsert({
      where: { code: plan.code },
      create: {
        code: plan.code,
        name: plan.name,
        priceMonthly: D(plan.priceMonthly),
        priceYearly,
        limits: plan.limits,
      },
      update: { name: plan.name, priceMonthly: D(plan.priceMonthly), priceYearly, limits: plan.limits },
    });
  }
}

async function seedModules() {
  for (const mod of MODULE_REGISTRY) {
    await prisma.module.upsert({
      where: { key: mod.key },
      create: {
        key: mod.key,
        name: mod.name,
        version: mod.version,
        isCore: mod.isCore,
        dependsOn: mod.dependsOn,
        minPlan: mod.minPlan,
      },
      update: {
        name: mod.name,
        version: mod.version,
        isCore: mod.isCore,
        dependsOn: mod.dependsOn,
        minPlan: mod.minPlan,
      },
    });
  }
}

async function seedDemoTenant() {
  const existing = await prisma.tenant.findUnique({ where: { slug: 'demo' } });
  if (existing) {
    console.log('Demo store already exists — skipped');
    return;
  }

  const adminRole = (await prisma.role.findFirst({ where: { tenantId: null, key: ROLES.ADMIN } }))!;
  const sellerRole = (await prisma.role.findFirst({ where: { tenantId: null, key: ROLES.SELLER } }))!;
  // Demo store on ENTERPRISE plan so all modules are visible
  const demoPlan = (await prisma.plan.findUnique({ where: { code: 'ENTERPRISE' } }))!;
  const coreModules = await prisma.module.findMany({ where: { isCore: true } });

  const tenant = await prisma.tenant.create({
    data: { name: 'Demo Store', slug: 'demo', phone: '0700000000', address: 'Kabul, Afghanistan' },
  });
  const tid = tenant.id;

  const mainBranch = await prisma.branch.create({
    data: {
      tenantId: tid,
      name: 'Main Branch',
      code: 'MAIN',
      isMain: true,
      address: 'Kabul — Shahr-e Naw',
      warehouses: { create: { tenantId: tid, name: 'Main Warehouse', isDefault: true } },
    },
    include: { warehouses: true },
  });
  const branch2 = await prisma.branch.create({
    data: {
      tenantId: tid,
      name: 'Karte Naw Branch',
      code: 'KN01',
      address: 'Kabul — Karte Naw',
      warehouses: { create: { tenantId: tid, name: 'Karte Naw Warehouse', isDefault: true } },
    },
    include: { warehouses: true },
  });
  const mainWarehouse = mainBranch.warehouses[0];
  const warehouse2 = branch2.warehouses[0];

  const passwordHash = await bcrypt.hash('Admin@1234', 10);
  const admin = await prisma.user.create({
    data: {
      tenantId: tid,
      email: 'admin@demo.af',
      passwordHash,
      fullName: 'Ahmad Wali',
      phone: '0700000001',
      roleId: adminRole.id,
      branchId: mainBranch.id,
    },
  });
  const seller = await prisma.user.create({
    data: {
      tenantId: tid,
      email: 'seller@demo.af',
      passwordHash,
      fullName: 'Mahmood Khan',
      roleId: sellerRole.id,
      branchId: mainBranch.id,
    },
  });

  await prisma.subscription.create({
    data: { tenantId: tid, planId: demoPlan.id, status: 'ACTIVE' },
  });
  await prisma.tenantModule.createMany({
    data: coreModules.map((m) => ({ tenantId: tid, moduleId: m.id, enabled: true })),
  });

  // 3-level categories
  const food = await prisma.category.create({
    data: { tenantId: tid, name: 'Food', slug: 'food', sortOrder: 1 },
  });
  const grains = await prisma.category.create({
    data: { tenantId: tid, name: 'Grains & Legumes', slug: 'grains', parentId: food.id },
  });
  const rice = await prisma.category.create({
    data: { tenantId: tid, name: 'Rice', slug: 'rice', parentId: grains.id },
  });
  const drinks = await prisma.category.create({
    data: { tenantId: tid, name: 'Beverages', slug: 'drinks', sortOrder: 2 },
  });
  const home = await prisma.category.create({
    data: { tenantId: tid, name: 'Household Items', slug: 'home', sortOrder: 3 },
  });

  const productDefs: {
    name: string; sku: string; categoryId: string; purchase: number; sale: number;
    unit?: string; minStock?: number; barcode?: string;
  }[] = [
    { name: 'Sela Rice 25kg', sku: 'RICE-SELA-25', categoryId: rice.id, purchase: 2200, sale: 2600, unit: 'Sack', minStock: 10, barcode: '8901001' },
    { name: 'Basmati Rice 10kg', sku: 'RICE-BAS-10', categoryId: rice.id, purchase: 1400, sale: 1650, unit: 'Sack', minStock: 8, barcode: '8901002' },
    { name: 'Wheat Flour 50kg', sku: 'FLOUR-50', categoryId: grains.id, purchase: 1900, sale: 2150, unit: 'Sack', minStock: 15 },
    { name: 'Chickpea Lentils 1kg', sku: 'DAL-1', categoryId: grains.id, purchase: 90, sale: 120, minStock: 30 },
    { name: 'Sunflower Oil 5L', sku: 'OIL-SUN-5', categoryId: food.id, purchase: 620, sale: 720, minStock: 20, barcode: '8901005' },
    { name: 'Green Tea 500g', sku: 'TEA-GREEN-500', categoryId: food.id, purchase: 240, sale: 300, minStock: 12 },
    { name: 'Sugar 1kg', sku: 'SUGAR-1', categoryId: food.id, purchase: 65, sale: 85, minStock: 40 },
    { name: 'Soda 1.5L', sku: 'SODA-1.5', categoryId: drinks.id, purchase: 45, sale: 60, minStock: 48, barcode: '8901008' },
    { name: 'Mineral Water 0.5L', sku: 'WATER-05', categoryId: drinks.id, purchase: 10, sale: 15, minStock: 100 },
    { name: 'Tea Maker Machine', sku: 'HOME-TEA-01', categoryId: home.id, purchase: 1800, sale: 2400, minStock: 3 },
  ];

  const products: { id: string; sku: string; purchase: number; sale: number }[] = [];
  for (const def of productDefs) {
    const product = await prisma.product.create({
      data: {
        tenantId: tid,
        categoryId: def.categoryId,
        name: def.name,
        slug: def.sku.toLowerCase(),
        sku: def.sku,
        barcode: def.barcode,
        unit: def.unit ?? 'Piece',
        purchasePrice: D(def.purchase),
        salePrice: D(def.sale),
        minStockLevel: def.minStock ?? 0,
      },
    });
    await prisma.priceHistory.createMany({
      data: [
        { tenantId: tid, productId: product.id, priceType: 'PURCHASE', newPrice: D(def.purchase), changedById: admin.id },
        { tenantId: tid, productId: product.id, priceType: 'SALE', newPrice: D(def.sale), changedById: admin.id },
      ],
    });
    products.push({ id: product.id, sku: def.sku, purchase: def.purchase, sale: def.sale });
  }

  // Initial stock: main warehouse full, second branch less; one deliberately below minimum
  for (const [index, product] of products.entries()) {
    const mainQty = index === 5 ? 4 : 40 + index * 5; // Green tea deliberately low — low-stock warning
    await prisma.stock.create({
      data: { tenantId: tid, productId: product.id, warehouseId: mainWarehouse.id, quantity: mainQty },
    });
    await prisma.stock.create({
      data: { tenantId: tid, productId: product.id, warehouseId: warehouse2.id, quantity: 15 },
    });
    await prisma.stockMovement.create({
      data: {
        tenantId: tid,
        productId: product.id,
        warehouseId: mainWarehouse.id,
        type: 'PURCHASE_IN',
        quantity: mainQty,
        reason: 'Initial stock',
        performedById: admin.id,
      },
    });
  }

  // Income parts: every branch has a Cash, EBT and Zelle register
  const registerDefs: { branchId: string; part: IncomePart; name: string; opening: number }[] = [
    { branchId: mainBranch.id, part: 'CASH', name: 'Cash', opening: 10000 },
    { branchId: mainBranch.id, part: 'EBT', name: 'EBT', opening: 2000 },
    { branchId: mainBranch.id, part: 'ZELLE', name: 'Zelle', opening: 3000 },
    { branchId: branch2.id, part: 'CASH', name: 'Cash', opening: 5000 },
    { branchId: branch2.id, part: 'EBT', name: 'EBT', opening: 0 },
    { branchId: branch2.id, part: 'ZELLE', name: 'Zelle', opening: 0 },
  ];
  const registerByPart = new Map<IncomePart, { id: string; balance: Prisma.Decimal }>();
  for (const def of registerDefs) {
    const register = await prisma.cashRegister.create({
      data: {
        tenantId: tid,
        branchId: def.branchId,
        part: def.part,
        name: def.name,
        isDefault: true,
        openingBalance: D(def.opening),
        balance: D(def.opening),
      },
    });
    if (def.branchId === mainBranch.id) registerByPart.set(def.part, { id: register.id, balance: D(def.opening) });
  }

  // Sales with different payment methods; some today and some earlier in the month
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const partOf: Record<PaymentMethod, IncomePart | null> = {
    CASH: 'CASH', CARD: 'ZELLE', EBT: 'EBT', ZELLE: 'ZELLE', LOAN: null, DEFICIT: null,
  };
  const saleDefs: {
    method: PaymentMethod; createdAt: Date; party?: string;
    items: { productIndex: number; qty: number }[];
  }[] = [
    { method: 'CASH', createdAt: now, items: [{ productIndex: 0, qty: 2 }, { productIndex: 6, qty: 10 }] },
    { method: 'EBT', createdAt: now, items: [{ productIndex: 7, qty: 12 }] },
    { method: 'ZELLE', createdAt: now, items: [{ productIndex: 1, qty: 1 }, { productIndex: 4, qty: 2 }] },
    { method: 'CARD', createdAt: daysAgo(1), items: [{ productIndex: 2, qty: 3 }] },
    { method: 'CASH', createdAt: daysAgo(2), items: [{ productIndex: 8, qty: 24 }] },
    { method: 'LOAN', createdAt: daysAgo(3), party: 'Najibullah Rahimi', items: [{ productIndex: 0, qty: 1 }, { productIndex: 3, qty: 5 }] },
    { method: 'DEFICIT', createdAt: daysAgo(5), party: 'Fatima Ahmadi', items: [{ productIndex: 9, qty: 1 }] },
    { method: 'CASH', createdAt: daysAgo(4), items: [{ productIndex: 5, qty: 2 }] },
  ];

  let saleNumber = 0;
  for (const def of saleDefs) {
    saleNumber += 1;
    const items = def.items.map(({ productIndex, qty }) => {
      const p = products[productIndex];
      return {
        productId: p.id,
        productName: productDefs[productIndex].name,
        quantity: qty,
        unitPrice: D(p.sale),
        unitCost: D(p.purchase),
        total: D(p.sale * qty),
      };
    });
    const total = items.reduce((sum, i) => sum.add(i.total), D(0));
    const cost = items.reduce((sum, i) => sum.add(i.unitCost.mul(i.quantity)), D(0));
    const part = partOf[def.method];
    const register = part ? registerByPart.get(part)! : null;

    const sale = await prisma.sale.create({
      data: {
        tenantId: tid,
        branchId: mainBranch.id,
        saleNumber,
        total,
        cost,
        paymentMethod: def.method,
        registerId: register?.id ?? null,
        createdById: seller.id,
        createdAt: def.createdAt,
        items: { create: items },
      },
    });

    if (register) {
      register.balance = register.balance.add(total);
      await prisma.cashTransaction.create({
        data: {
          tenantId: tid,
          registerId: register.id,
          type: 'SALE',
          amount: total,
          balanceAfter: register.balance,
          category: def.method,
          note: `Sale #${saleNumber}`,
          referenceType: 'sale',
          referenceId: sale.id,
          performedById: seller.id,
          createdAt: def.createdAt,
        },
      });
      await prisma.cashRegister.update({ where: { id: register.id }, data: { balance: register.balance } });
    } else {
      const debt = await prisma.debt.create({
        data: {
          tenantId: tid,
          direction: 'RECEIVABLE',
          kind: def.method === 'LOAN' ? 'LOAN' : 'DEFICIT',
          partyName: def.party!,
          amount: total,
          dueDate: new Date(now.getTime() + 14 * 86_400_000),
          referenceType: 'sale',
          referenceId: sale.id,
          notes: `Sale #${saleNumber}`,
          createdById: admin.id,
          createdAt: def.createdAt,
        },
      });
      await prisma.sale.update({ where: { id: sale.id }, data: { debtId: debt.id } });
    }

    // Stock effect of the sale
    for (const item of items) {
      await prisma.stock.update({
        where: { productId_warehouseId: { productId: item.productId, warehouseId: mainWarehouse.id } },
        data: { quantity: { decrement: item.quantity } },
      });
      await prisma.stockMovement.create({
        data: {
          tenantId: tid,
          productId: item.productId,
          warehouseId: mainWarehouse.id,
          type: 'SALE_OUT',
          quantity: item.quantity,
          referenceType: 'sale',
          referenceId: sale.id,
          performedById: seller.id,
          createdAt: def.createdAt,
        },
      });
    }
  }

  console.log('Demo store created ✓');
}

async function main() {
  await seedPermissions();
  await seedSystemRoles();
  await seedPlans();
  await seedModules();
  await seedDemoTenant();
  console.log('---------------------------------------');
  console.log('Seed complete.');
  console.log('Test login:  admin@demo.af  /  Admin@1234');
  console.log('Seller:      seller@demo.af /  Admin@1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
