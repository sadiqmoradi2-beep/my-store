import { Injectable } from '@nestjs/common';
import { SalesService } from '../sales/sales.service';
import { PosSaleDto } from './dto/pos.dto';

@Injectable()
export class PosService {
  constructor(private readonly sales: SalesService) {}

  /** POS sale: the cart becomes a sale, stock is deducted and the payment goes to its Income part (or Loan & Deficit) */
  sale(tenantId: string, userId: string, dto: PosSaleDto) {
    return this.sales.createFromCart(tenantId, userId, dto);
  }
}
