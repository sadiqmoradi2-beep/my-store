import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '@my-store/shared';

export interface RequestUser extends JwtPayload {
  userId: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
