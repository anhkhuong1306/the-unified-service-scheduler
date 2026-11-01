import { ArrayNotEmpty, IsArray, IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Trim } from '@app/common';

export class CreateAppointmentDto {
  @IsNotEmpty()
  @IsString()
  @Trim()
  public dealershipId!: string;

  @IsNotEmpty()
  @IsString()
  @Trim()
  public vehicleId!: string;

  @IsNotEmpty()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  public serviceTypeIds!: string[];

  @IsNotEmpty()
  @IsISO8601()
  @Trim()
  public startAt!: string;

  @IsOptional()
  @IsString()
  @Trim()
  public technicianId?: string;

  @IsOptional()
  @IsString()
  @Trim()
  public requestedTechnicianId?: string;

  @IsOptional()
  @IsString()
  @Trim()
  public notes?: string;

  @IsOptional()
  @IsString()
  @Trim()
  public customerNotes?: string;
}
