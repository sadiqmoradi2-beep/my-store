import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { CURRENCIES, Currency } from '@my-store/shared';

const GATEWAY_PURPOSES = ['SUBSCRIPTION'] as const;
export type GatewayPurpose = (typeof GATEWAY_PURPOSES)[number];

export class CreateGatewayIntentDto {
  @IsEnum(GATEWAY_PURPOSES)
  purpose: GatewayPurpose;

  @IsOptional()
  @IsString()
  referenceId?: string;

  /** VISA_CARD | OTHER_ONLINE | AUTOMATIC — or any other free-form identifier for a future gateway */
  @IsOptional()
  @IsString()
  provider?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsEnum(CURRENCIES)
  currency?: Currency;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

export class ConfirmGatewayIntentDto {
  @IsOptional()
  @IsString()
  providerRef?: string;
}
