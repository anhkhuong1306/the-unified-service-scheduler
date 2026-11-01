import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CursorPaginationDto {
  @ApiPropertyOptional({
    description: 'Opaque base64url cursor pointing to the last evaluated element in the previous page',
    example: 'eyJpZCI6IjEwIn0',
  })
  @IsOptional()
  @IsString()
  public cursor?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of items to return per page (min: 1, max: 100, default: 20)',
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  public limit?: number = 20;
}
