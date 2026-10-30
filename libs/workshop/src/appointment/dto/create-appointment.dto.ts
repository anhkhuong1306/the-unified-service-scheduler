import { IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAppointmentDto {
  @IsNotEmpty()
  @IsString()
  public dealershipId!: string;

  @IsNotEmpty()
  @IsString()
  public vehicleId!: string;

  @IsNotEmpty()
  @IsString()
  public serviceTypeId!: string;

  @IsNotEmpty()
  @IsISO8601()
  public startAt!: string;

  @IsOptional()
  @IsString()
  public technicianId?: string;

  @IsOptional()
  @IsString()
  public notes?: string;
}
