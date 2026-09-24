import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { UI_ACCENTS, UI_DENSITIES, UI_FONT_SCALES, UiAccent, UiDensity, UiFontScale } from '@my-store/shared';

export class UpdateUiPrefsDto {
  @IsOptional()
  @IsIn(UI_ACCENTS)
  accent?: UiAccent;

  @IsOptional()
  @IsIn(UI_FONT_SCALES)
  fontScale?: UiFontScale;

  @IsOptional()
  @IsIn(UI_DENSITIES)
  density?: UiDensity;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  menuOrder?: string[];
}
