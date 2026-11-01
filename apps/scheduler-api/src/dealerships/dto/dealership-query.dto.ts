import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { OffsetPaginationDto, Trim } from '@app/common';

export class DealershipQueryDto extends OffsetPaginationDto {
  @ApiPropertyOptional({ description: 'Filter by dealership code' })
  @IsOptional()
  @Trim()
  @IsString()
  public code?: string;

  @ApiPropertyOptional({ description: 'Filter by dealership name' })
  @IsOptional()
  @Trim()
  @IsString()
  public name?: string;

  @ApiPropertyOptional({ description: 'Optional cursor for backwards-compatible seeking' })
  @IsOptional()
  @IsString()
  public cursor?: string;
}
