import { SetMetadata } from '@nestjs/common';

export const MODULE_KEY = 'module_key';

/** The store module that this controller/handler belongs to — for feature gating */
export const RequireModule = (key: string) => SetMetadata(MODULE_KEY, key);
