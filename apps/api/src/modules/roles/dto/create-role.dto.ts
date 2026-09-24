import { ArrayNotEmpty, IsArray, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @Matches(/^[A-Z0-9_]+$/, { message: 'Role key: only uppercase Latin letters and _' })
  @MinLength(2)
  @MaxLength(50)
  key: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissionKeys: string[];
}
