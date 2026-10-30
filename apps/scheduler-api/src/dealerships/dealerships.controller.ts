import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RequestContextService } from '@app/common';
import { Dealership, DealershipService } from '@app/organization';
import {
  AvailabilityResponseDto,
  DealershipAvailableSlotsResponseDto,
  ResourceAvailabilityService,
  SlotTechniciansResponseDto,
} from '@app/workshop';

/**
 * HTTP Controller handling Dealership discovery, slot availability queries,
 * and technician lookups for customer and staff booking flows.
 *
 * Adheres strictly to Clean Architecture: Pure HTTP Adapter with zero business logic
 * or direct database queries; delegates 100% of execution to dedicated application services.
 */
@ApiTags('Dealerships')
@Controller({ path: 'v1/dealerships' })
export class DealershipsController {
  public constructor(
    private readonly dealershipService: DealershipService,
    private readonly availabilityService: ResourceAvailabilityService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all operational dealerships for the active tenant' })
  public async listDealerships(): Promise<Dealership[]> {
    const tenantId = String(RequestContextService.getTenantId() ?? 1);
    return this.dealershipService.listDealerships(tenantId);
  }

  @Get(':id/available-slots')
  @ApiOperation({
    summary:
      'Retrieve all available slots and service types for a dealership on a given date, including available technician details per slot',
  })
  @ApiQuery({
    name: 'date',
    required: true,
    description: 'Target query date in YYYY-MM-DD format',
    example: '2026-11-01',
  })
  @ApiQuery({
    name: 'serviceTypeId',
    required: false,
    description: 'Optional service type filter. If omitted, returns slots for all active service types',
    example: '1',
  })
  public async getAvailableSlots(
    @Param('id') id: string,
    @Query('date') date: string,
    @Query('serviceTypeId') serviceTypeId?: string,
  ): Promise<DealershipAvailableSlotsResponseDto> {
    const tenantId = String(RequestContextService.getTenantId() ?? 1);
    return this.availabilityService.getDealershipAvailableSlots(
      tenantId,
      id,
      date,
      serviceTypeId,
    );
  }

  @Get(':id/availability')
  @ApiOperation({
    summary:
      'Query slot grid availability and free technicians for a specific dealership, service type, and date',
  })
  @ApiQuery({ name: 'date', required: true, example: '2026-11-01' })
  @ApiQuery({ name: 'service_type_id', required: true, example: '1' })
  public async getAvailability(
    @Param('id') id: string,
    @Query('date') date: string,
    @Query('service_type_id') serviceTypeId: string,
  ): Promise<AvailabilityResponseDto> {
    const tenantId = String(RequestContextService.getTenantId() ?? 1);
    return this.availabilityService.getAvailability(tenantId, id, serviceTypeId, date);
  }

  @Get(':id/technicians')
  @ApiOperation({
    summary:
      'Query all qualified technicians free for a specific service type and slot start time, allowing customer selection',
  })
  @ApiQuery({ name: 'service_type_id', required: true, example: '1' })
  @ApiQuery({
    name: 'start_at',
    required: true,
    description: 'Service start timestamp in ISO 8601 UTC format',
    example: '2026-11-01T01:00:00.000Z',
  })
  public async getTechnicians(
    @Param('id') id: string,
    @Query('service_type_id') serviceTypeId: string,
    @Query('start_at') startAt: string,
  ): Promise<SlotTechniciansResponseDto> {
    const tenantId = String(RequestContextService.getTenantId() ?? 1);
    return this.availabilityService.getTechniciansForSlot(
      tenantId,
      id,
      serviceTypeId,
      startAt,
    );
  }
}
