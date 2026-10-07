import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ATTENDANCE_STATUSES,
  AttendanceStatus,
  EMPLOYEE_POSITIONS,
  EmployeePosition,
  SALARY_PAYMENT_STATUSES,
  SELLER_PAY_TYPES,
  SalaryPaymentStatus,
  SellerPayType,
} from '@my-store/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CreateEmployeeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  position: string;

  /** Position preset — used to determine the automatic user account role; empty = other */
  @IsOptional()
  @IsEnum(EMPLOYEE_POSITIONS)
  positionPreset?: EmployeePosition;

  /** Explicit role for the new account — overrides the positionPreset-derived role (e.g. a custom "manager" role with limited access instead of full BRANCH_MANAGER control) */
  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(SELLER_PAY_TYPES)
  payType?: SellerPayType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salary: number;

  /** positionPreset SELLER only: commission percent for a linked seller profile */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  commissionPercent?: number;

  /** positionPreset SELLER only, payType FIXED_SALARY: fixed salary on the linked seller profile */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fixedSalaryAmount?: number;

  @IsOptional()
  @IsDateString()
  hiredAt?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  /** Email — if provided, a login user account is created automatically */
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  createLogin?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  position?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(SELLER_PAY_TYPES)
  payType?: SellerPayType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salary?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PaySalaryDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  /** Salary period — e.g. "1405-04" */
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  period: string;

  /** Payment register — empty = no register effect */
  @IsOptional()
  @IsString()
  registerId?: string;

  /** The work session whose cash box paid / received this. Empty = the main cash box; not given = the user's own active session */
  @IsOptional()
  @IsString()
  sessionId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  bonus?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  deduction?: number;

  /** Optional pay slip / receipt image or PDF */
  @IsOptional()
  @IsString()
  receiptImageUrl?: string;

  /** PENDING = record without a cash effect yet; PAID (default) = pay immediately */
  @IsOptional()
  @IsEnum(SALARY_PAYMENT_STATUSES)
  status?: SalaryPaymentStatus;

  /** When it happened — leave empty for now; a past date back-fills an old transaction (no future dates) */
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class SalaryListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  employeeId?: string;
}

export class MarkSalaryPaidDto {
  /** Register to record the deferred expense against — falls back to the payment's own registerId if omitted */
  @IsOptional()
  @IsString()
  registerId?: string;
}

export class StartShiftDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingCash: number;

  @IsOptional()
  @IsString()
  registerId?: string;
}

export class EndShiftDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  closingCash: number;
}

export class AttendanceQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class MarkAttendanceDto {
  @IsDateString()
  date: string;

  @IsEnum(ATTENDANCE_STATUSES)
  status: AttendanceStatus;

  @IsOptional()
  @IsDateString()
  checkIn?: string;

  @IsOptional()
  @IsDateString()
  checkOut?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
