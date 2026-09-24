import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception.code === 'P2002') {
      const target = (exception.meta?.target as string[])?.join(', ') ?? '';
      return response.status(HttpStatus.CONFLICT).json({
        success: false,
        error: { code: 'DUPLICATE', message: `Duplicate value: ${target}` },
      });
    }

    if (exception.code === 'P2025') {
      return response.status(HttpStatus.NOT_FOUND).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Item not found' },
      });
    }

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: { code: `PRISMA_${exception.code}`, message: 'Database error' },
    });
  }
}
