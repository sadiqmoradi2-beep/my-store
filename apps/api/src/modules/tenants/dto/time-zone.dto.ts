import { IsString, MaxLength, MinLength } from 'class-validator';

export class SetTimeZoneDto {
  /** IANA zone, e.g. America/New_York — checked against the runtime's time-zone database */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  timeZone: string;
}
