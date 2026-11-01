import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Trim } from '@app/common';

export class AppointmentAvailabilityQueryDto {
  @ApiProperty({ description: 'Dealership identifier', example: '1' })
  @IsNotEmpty()
  @Trim()
  @IsString()
  public dealershipId!: string;

  @ApiPropertyOptional({ description: 'Dealership identifier (snake_case alias)', example: '1' })
  @IsOptional()
  @Trim()
  @IsString()
  public dealership_id?: string;

  @ApiProperty({ description: 'Service type identifier', example: '1' })
  @IsNotEmpty()
  @Trim()
  @IsString()
  public serviceTypeId!: string;

  @ApiPropertyOptional({ description: 'Service type identifier (snake_case alias)', example: '1' })
  @IsOptional()
  @Trim()
  @IsString()
  public service_type_id?: string;

  @ApiProperty({ description: 'Target date (YYYY-MM-DD)', example: '2026-11-01' })
  @IsNotEmpty()
  @Trim()
  @IsString()
  public date!: string;
}
