import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoryDto } from '@my-store/shared';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CategoriesRepository } from './categories.repository';

type CategoryRow = Awaited<ReturnType<CategoriesRepository['findAll']>>[number];

@Injectable()
export class CategoriesService {
  constructor(private readonly repo: CategoriesRepository) {}

  /** Full category tree — unlimited nesting */
  async tree(tenantId: string): Promise<CategoryDto[]> {
    const rows = await this.repo.findAll(tenantId);
    return buildTree(rows);
  }

  async create(tenantId: string, dto: CreateCategoryDto) {
    if (dto.parentId) await this.assertExists(tenantId, dto.parentId);
    return this.repo.create(tenantId, dto);
  }

  async update(tenantId: string, id: string, dto: UpdateCategoryDto) {
    await this.assertExists(tenantId, id);
    if (dto.parentId) {
      if (dto.parentId === id) throw new BadRequestException('A category cannot be its own parent');
      await this.assertNotDescendant(tenantId, id, dto.parentId);
    }
    return this.repo.update(id, dto);
  }

  async remove(tenantId: string, id: string) {
    const category = await this.assertExists(tenantId, id);
    if (category.children.length > 0) {
      throw new BadRequestException('Delete or move the subcategories first');
    }
    const productCount = await this.repo.countProducts(tenantId, id);
    if (productCount > 0) {
      throw new BadRequestException('This category has products and cannot be deleted');
    }
    await this.repo.update(id, { deletedAt: new Date(), isActive: false });
    return { deleted: true };
  }

  private async assertExists(tenantId: string, id: string) {
    const category = await this.repo.findById(tenantId, id);
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  /** Prevent a cycle: the new parent must not be a descendant of this category */
  private async assertNotDescendant(tenantId: string, id: string, newParentId: string) {
    const rows = await this.repo.findAll(tenantId);
    const childrenOf = new Map<string | null, string[]>();
    for (const row of rows) {
      const list = childrenOf.get(row.parentId) ?? [];
      list.push(row.id);
      childrenOf.set(row.parentId, list);
    }
    const stack = [id];
    while (stack.length) {
      const current = stack.pop()!;
      if (current === newParentId) {
        throw new BadRequestException('The selected parent is a subcategory of this category');
      }
      stack.push(...(childrenOf.get(current) ?? []));
    }
  }
}

function buildTree(rows: CategoryRow[]): CategoryDto[] {
  const nodes = new Map<string, CategoryDto>();
  const roots: CategoryDto[] = [];
  for (const row of rows) {
    nodes.set(row.id, {
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      slug: row.slug,
      imageUrl: row.imageUrl,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      productCount: row._count.products,
      children: [],
    });
  }
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children!.push(node);
    else roots.push(node);
  }
  return roots;
}
