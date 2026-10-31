import {
  Controller,
  Get,
  Optional,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  ApiResponse,
  ApiResponseEnvelope,
  CursorPaginationDto,
  CursorPaginationHelper,
  RequestContextService,
} from '@app/common';
import { Dealership, DealershipService } from '@app/organization';
import {
  AvailabilityResponseDto,
  DealershipAvailableSlotsResponseDto,
  ResourceAvailabilityService,
  SlotTechniciansResponseDto,
  WorkshopCacheService,
} from '@app/workshop';

/**
 * HTTP Controller handling Dealership discovery, slot availability queries,
 * and technician lookups for customer and staff booking flows with cursor-based pagination.
 */
@ApiTags('Dealerships')
@Controller({ path: 'v1/dealerships' })
export class DealershipsController {
  public constructor(
    private readonly dealershipService: DealershipService,
    private readonly availabilityService: ResourceAvailabilityService,
    @Optional()
    private readonly workshopCache?: WorkshopCacheService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all operational dealerships for the active tenant with cursor pagination' })
  public async listDealerships(
    @Query() paginationDto: CursorPaginationDto,
  ): Promise<ApiResponseEnvelope<Dealership[]>> {
    const tenantId = String(RequestContextService.getTenantId() ?? 1);
    const result = await this.dealershipService.listDealershipsPaginated(tenantId, paginationDto);
    return ApiResponse.cursorPaginated(result.items, result.meta);
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
      'Query qualified technicians for a specific dealership (with optional slot filtering and cursor-based pagination)',
  })
  @ApiQuery({ name: 'service_type_id', required: false, example: '1' })
  @ApiQuery({
    name: 'start_at',
    required: false,
    description: 'Optional service start timestamp in ISO 8601 UTC format',
    example: '2026-11-01T01:00:00.000Z',
  })
  public async getTechnicians(
    @Param('id') id: string,
    @Query('service_type_id') serviceTypeId?: string,
    @Query('start_at') startAt?: string,
    @Query() paginationDto: CursorPaginationDto = {},
  ): Promise<ApiResponseEnvelope<any[]>> {
    const tenantId = String(RequestContextService.getTenantId() ?? 1);

    if (serviceTypeId && startAt) {
      const slotResult = await this.availabilityService.getTechniciansForSlot(
        tenantId,
        id,
        serviceTypeId,
        startAt,
      );
      const paginated = CursorPaginationHelper.paginateArray(slotResult.technicians, paginationDto);
      return ApiResponse.cursorPaginated(paginated.items, paginated.meta);
    }

    // When no slot filters are specified: list all dealership technicians from Redis Hash Cache / DB
    const technicians = this.workshopCache
      ? await this.workshopCache.getTechnicians(id, tenantId)
      : [];
    const paginated = CursorPaginationHelper.paginateArray(technicians, paginationDto);
    return ApiResponse.cursorPaginated(paginated.items, paginated.meta);
  }
}
