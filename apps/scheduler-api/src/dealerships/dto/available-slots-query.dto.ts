import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Trim } from '@app/common';

export class AvailableSlotsQueryDto {
  @ApiPropertyOptional({ description: 'Target date (YYYY-MM-DD)' })
  @IsOptional()
  @Trim()
  @IsString()
  public date?: string;

  @ApiPropertyOptional({ description: 'Optional service type filter' })
  @IsOptional()
  @IsString()
  public serviceTypeId?: string;

  @ApiPropertyOptional({ description: 'Optional service type filter (snake_case alias)' })
  @IsOptional()
  @IsString()
  public service_type_id?: string;
}
