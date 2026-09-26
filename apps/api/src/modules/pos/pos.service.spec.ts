import { Test } from '@nestjs/testing';
import { SalesService } from '../sales/sales.service';
import { PosService } from './pos.service';

describe('PosService.sale', () => {
  it('hands the checkout to the sales service with tenant and user', async () => {
    const sales = { createFromCart: jest.fn().mockResolvedValue({ sale: { id: 's1' }, change: '0' }) };
    const moduleRef = await Test.createTestingModule({
      providers: [PosService, { provide: SalesService, useValue: sales }],
    }).compile();
    const dto = { cartId: 'cart-1', paymentMethod: 'EBT' as const };
    const result = await moduleRef.get(PosService).sale('t1', 'u1', dto);
    expect(sales.createFromCart).toHaveBeenCalledWith('t1', 'u1', dto);
    expect(result.sale.id).toBe('s1');
  });
});
