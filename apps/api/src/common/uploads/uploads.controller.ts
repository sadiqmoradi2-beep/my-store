import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BadRequestException, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { diskStorage } from 'multer';
import { PERMISSIONS } from '@my-store/shared';
import { RequirePermissions } from '../decorators/require-permissions.decorator';

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** Invoices and payment proofs also accept scanned PDFs, in addition to images */
const ALLOWED_DOCUMENT_MIME_TYPES = [...ALLOWED_IMAGE_MIME_TYPES, 'application/pdf'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

// The stored extension is derived from the validated MIME type, never from the client-supplied
// original filename — otherwise a crafted "x.jpg" with Content-Type: image/jpeg but real .svg
// content (or vice versa) could be stored and later served with a dangerous extension/content type.
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};
const BASE_DIR = resolve(process.cwd(), 'storage', 'uploads', 'purchase-invoices');
const WAREHOUSE_REQUESTS_DIR = resolve(process.cwd(), 'storage', 'uploads', 'warehouse-requests');
const PAYMENT_PROOFS_DIR = resolve(process.cwd(), 'storage', 'uploads', 'payment-proofs');
const SALARY_RECEIPTS_DIR = resolve(process.cwd(), 'storage', 'uploads', 'salary-receipts');
const CASH_RECEIPTS_DIR = resolve(process.cwd(), 'storage', 'uploads', 'cash-receipts');

function tenantScopedStorage(baseDir: string) {
  return diskStorage({
    destination: (req: Request & { user?: { tenantId?: string } }, _file, cb) => {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        cb(new BadRequestException('This operation requires a store account'), '');
        return;
      }
      const dir = join(baseDir, tenantId);
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${EXTENSION_BY_MIME_TYPE[file.mimetype] ?? ''}`),
  });
}

/** Generic file upload — currently just purchase invoice photos; stored on local disk under storage/uploads */
@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  @Post('purchase-invoices')
  @RequirePermissions(PERMISSIONS.PURCHASES_CREATE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: tenantScopedStorage(BASE_DIR),
      limits: { fileSize: MAX_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
          cb(new BadRequestException('Only image or PDF files (jpg/png/webp/pdf) are allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File & { destination: string }) {
    if (!file) throw new BadRequestException('No file was sent');
    const tenantId = file.destination.split(/[/\\]/).pop();
    return { url: `/uploads/purchase-invoices/${tenantId}/${file.filename}` };
  }

  /** Warehouse request receipt image (transfer) */
  @Post('warehouse-requests')
  @RequirePermissions(PERMISSIONS.INVENTORY_TRANSFER)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: tenantScopedStorage(WAREHOUSE_REQUESTS_DIR),
      limits: { fileSize: MAX_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
          cb(new BadRequestException('Only image files (jpg/png/webp) are allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadWarehouseRequest(@UploadedFile() file: Express.Multer.File & { destination: string }) {
    if (!file) throw new BadRequestException('No file was sent');
    const tenantId = file.destination.split(/[/\\]/).pop();
    return { url: `/uploads/warehouse-requests/${tenantId}/${file.filename}` };
  }

  /** Cheque / payment-proof image or PDF for a debt payment (e.g. supplier payments) */
  @Post('payment-proofs')
  @RequirePermissions(PERMISSIONS.DEBTS_MANAGE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: tenantScopedStorage(PAYMENT_PROOFS_DIR),
      limits: { fileSize: MAX_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
          cb(new BadRequestException('Only image or PDF files (jpg/png/webp/pdf) are allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadPaymentProof(@UploadedFile() file: Express.Multer.File & { destination: string }) {
    if (!file) throw new BadRequestException('No file was sent');
    const tenantId = file.destination.split(/[/\\]/).pop();
    return { url: `/uploads/payment-proofs/${tenantId}/${file.filename}` };
  }

  /** Pay slip / receipt for a salary payment made from the cash screen */
  @Post('salary-receipts')
  @RequirePermissions(PERMISSIONS.CASH_TRANSACT)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: tenantScopedStorage(SALARY_RECEIPTS_DIR),
      limits: { fileSize: MAX_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
          cb(new BadRequestException('Only image or PDF files (jpg/png/webp/pdf) are allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadSalaryReceipt(@UploadedFile() file: Express.Multer.File & { destination: string }) {
    if (!file) throw new BadRequestException('No file was sent');
    const tenantId = file.destination.split(/[/\\]/).pop();
    return { url: `/uploads/salary-receipts/${tenantId}/${file.filename}` };
  }

  /** Pay slip / receipt photo for a manual Income or Withdrawal cash transaction */
  @Post('cash-receipts')
  @RequirePermissions(PERMISSIONS.CASH_TRANSACT)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: tenantScopedStorage(CASH_RECEIPTS_DIR),
      limits: { fileSize: MAX_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
          cb(new BadRequestException('Only image or PDF files (jpg/png/webp/pdf) are allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadCashReceipt(@UploadedFile() file: Express.Multer.File & { destination: string }) {
    if (!file) throw new BadRequestException('No file was sent');
    const tenantId = file.destination.split(/[/\\]/).pop();
    return { url: `/uploads/cash-receipts/${tenantId}/${file.filename}` };
  }
}
