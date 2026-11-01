import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { OffsetPaginationDto, Trim } from '@app/common';

export class ServiceTypeQueryDto extends OffsetPaginationDto {
  @ApiPropertyOptional({ description: 'Filter by service type code' })
  @IsOptional()
  @Trim()
  @IsString()
  public code?: string;

  @ApiPropertyOptional({ description: 'Filter by service type name' })
  @IsOptional()
  @Trim()
  @IsString()
  public name?: string;

  @ApiPropertyOptional({ description: 'Optional cursor for backwards-compatible seeking' })
  @IsOptional()
  @Trim()
  @IsString()
  public cursor?: string;
}
