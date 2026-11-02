import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Trim } from '@app/common';

export class CreateAppointmentDto {
  @ApiProperty({
    name: 'dealership_id',
    description: 'Dealership identifier (snake_case in request)',
    example: '1',
  })
  @IsNotEmpty({ message: 'dealership_id is required' })
  @IsString({ message: 'dealership_id must be a string' })
  @Trim()
  public dealershipId!: string;

  @ApiProperty({
    name: 'vehicle_id',
    description: 'Customer vehicle identifier (snake_case in request)',
    example: '1',
  })
  @IsNotEmpty({ message: 'vehicle_id is required' })
  @IsString({ message: 'vehicle_id must be a string' })
  @Trim()
  public vehicleId!: string;

  @ApiProperty({
    name: 'service_type_ids',
    description: 'Array of service package IDs to book (snake_case in request)',
    example: ['1', '2'],
    type: [String],
  })
  @IsArray({ message: 'service_type_ids must be an array' })
  @ArrayNotEmpty({ message: 'service_type_ids must be a non-empty array' })
  @IsString({ each: true, message: 'Each item in service_type_ids must be a string' })
  public serviceTypeIds!: string[];

  @ApiProperty({
    name: 'start_at',
    description: 'Scheduled start time in ISO 8601 UTC format (snake_case in request)',
    example: '2026-11-03T08:00:00.000Z',
  })
  @IsNotEmpty({ message: 'start_at is required' })
  @IsISO8601({}, { message: 'start_at must be a valid ISO 8601 timestamp' })
  @Trim()
  public startAt!: string;

  @ApiPropertyOptional({
    name: 'technician_id',
    description: 'Optional preferred technician identifier (snake_case in request)',
    example: '1',
  })
  @IsOptional()
  @IsString()
  @Trim()
  public technicianId?: string;

  @ApiPropertyOptional({
    name: 'customer_notes',
    description: 'Optional customer instructions or notes (snake_case in request)',
    example: 'Periodic 10,000km maintenance and engine diagnostic',
  })
  @IsOptional()
  @IsString()
  @Trim()
  public customerNotes?: string;

  @ApiPropertyOptional({
    name: 'notes',
    description: 'Optional customer or operational notes alias',
    example: 'Periodic 10,000km maintenance and engine diagnostic',
  })
  @IsOptional()
  @IsString()
  @Trim()
  public notes?: string;
}
