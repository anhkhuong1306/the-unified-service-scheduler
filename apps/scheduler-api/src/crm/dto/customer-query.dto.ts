import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { OffsetPaginationDto, Trim } from '@app/common';

export class CustomerQueryDto extends OffsetPaginationDto {
  @ApiPropertyOptional({ description: 'Filter by customer code (e.g. CUST_001)' })
  @IsOptional()
  @Trim()
  @IsString()
  public code?: string;

  @ApiPropertyOptional({ description: 'Filter by customer name' })
  @IsOptional()
  @Trim()
  @IsString()
  public name?: string;

  @ApiPropertyOptional({ description: 'Filter by customer phone number' })
  @IsOptional()
  @Trim()
  @IsString()
  public phone?: string;

  @ApiPropertyOptional({ description: 'Filter by customer email address' })
  @IsOptional()
  @Trim()
  @IsString()
  public email?: string;
}
