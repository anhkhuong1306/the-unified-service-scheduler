import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Trim } from '@app/common';

export class StaffStreamQueryDto {
  @ApiPropertyOptional({
    name: 'dealership_id',
    description: 'Filter live stream by dealership identifier (snake_case in request)',
    example: '1',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public dealershipId?: string;

  @ApiPropertyOptional({
    name: 'technician_id',
    description: 'Filter live stream by technician identifier (snake_case in request)',
    example: '1',
  })
  @IsOptional()
  @Trim()
  @IsString()
  public technicianId?: string;
}
