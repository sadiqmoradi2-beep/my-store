import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AddCartItemDto,
  CreateCartDto,
} from './dto/cart.dto';

@Injectable()
export class CartsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(tenantId: string, dto: CreateCartDto) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    const cart = await this.prisma.cart.create({
      data: { tenantId, branchId: dto.branchId },
    });
    return this.get(tenantId, cart.id);
  }

  /** Cart + totals — shaped like CartDto */
  async get(tenantId: string, id: string) {
    const cart = await this.findCart(tenantId, id);
    const subtotal = cart.items.reduce(
      (sum, i) => sum.add(i.unitPrice.mul(i.quantity)),
      new Prisma.Decimal(0),
    );
    const cost = cart.items.reduce(
      (sum, i) => sum.add(i.product.purchasePrice.mul(i.quantity)),
      new Prisma.Decimal(0),
    );
    const { items, ...rest } = cart;
    return {
      ...rest,
      items: items.map(({ product, ...item }) => ({
        ...item,
        productName: product.name,
        unit: product.unit,
        purchasePrice: product.purchasePrice,
      })),
      subtotal,
      cost,
      total: subtotal,
    };
  }

  async remove(tenantId: string, id: string) {
    await this.findCart(tenantId, id);
    return this.prisma.cart.delete({ where: { id } });
  }

  /** Add item: a repeat scan = increase quantity; price is a snapshot at the moment it's added */
  async addItem(tenantId: string, id: string, dto: AddCartItemDto) {
    await this.findCart(tenantId, id);
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, tenantId, deletedAt: null, isActive: true },
      select: { id: true, salePrice: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    await this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: id, productId: product.id } },
      create: { cartId: id, productId: product.id, quantity: dto.quantity, unitPrice: product.salePrice },
      update: { quantity: { increment: dto.quantity } },
    });
    return this.get(tenantId, id);
  }

  async updateItem(
    tenantId: string,
    id: string,
    productId: string,
    quantity: number,
    unitPrice?: number,
  ) {
    await this.findCart(tenantId, id);
    const item = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: id, productId } },
    });
    if (!item) throw new NotFoundException('Item not found in cart');
    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity, ...(unitPrice != null && { unitPrice }) },
    });
    return this.get(tenantId, id);
  }

  async removeItem(tenantId: string, id: string, productId: string) {
    await this.findCart(tenantId, id);
    await this.prisma.cartItem.deleteMany({ where: { cartId: id, productId } });
    return this.get(tenantId, id);
  }

  private async findCart(tenantId: string, id: string) {
    const cart = await this.prisma.cart.findFirst({
      where: { id, tenantId },
      include: {
        items: { include: { product: { select: { name: true, unit: true, purchasePrice: true } } } },
      },
    });
    if (!cart) throw new NotFoundException('Cart not found');
    return cart;
  }
}
