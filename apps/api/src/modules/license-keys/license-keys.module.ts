import { Module } from '@nestjs/common';
import { LicenseKeysController } from './license-keys.controller';
import { LicenseKeysService } from './license-keys.service';

@Module({
  controllers: [LicenseKeysController],
  providers: [LicenseKeysService],
})
export class LicenseKeysModule {}
