import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Trim } from '@app/common';

export class StaffStreamQueryDto {
  @ApiPropertyOptional({ description: 'Filter live stream by dealership identifier (camelCase)' })
  @IsOptional()
  @Trim()
  @IsString()
  public dealershipId?: string;

  @ApiPropertyOptional({ description: 'Filter live stream by dealership identifier (snake_case alias)' })
  @IsOptional()
  @Trim()
  @IsString()
  public dealership_id?: string;

  @ApiPropertyOptional({ description: 'Filter live stream by technician identifier (camelCase)' })
  @IsOptional()
  @Trim()
  @IsString()
  public technicianId?: string;

  @ApiPropertyOptional({ description: 'Filter live stream by technician identifier (snake_case alias)' })
  @IsOptional()
  @Trim()
  @IsString()
  public technician_id?: string;
}
