import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Trim } from '@app/common';

export class AvailabilityQueryDto {
  @ApiPropertyOptional({ description: 'Target date (YYYY-MM-DD)', example: '2026-11-01' })
  @IsOptional()
  @Trim()
  @IsString()
  public date?: string;

  @ApiPropertyOptional({ description: 'Service type identifier filter (snake_case)', example: '1' })
  @IsOptional()
  @Trim()
  @IsString()
  public service_type_id?: string;

  @ApiPropertyOptional({ description: 'Service type identifier filter (camelCase alias)', example: '1' })
  @IsOptional()
  @Trim()
  @IsString()
  public serviceTypeId?: string;
}
