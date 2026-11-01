import {
  Controller,
  Get,
  Optional,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiResponse,
  ApiResponseEnvelope,
  CursorPaginationHelper,
  OffsetPaginationHelper,
  RequestContextService,
} , DEFAULT_TENANT_ID } from '@app/common';
import { Dealership, DealershipService } from '@app/organization';
import {
  AvailabilityResponseDto,
  DealershipAvailableSlotsResponseDto,
  ResourceAvailabilityService,
  Technician,
  WorkshopCacheService,
} from '@app/workshop';
import {
  AvailabilityQueryDto,
  AvailableSlotsQueryDto,
  DealershipQueryDto,
  TechnicianQueryDto,
} from './dto';

const BENCHMARK_DATE = '2026-11-01';
const DEFAULT_SERVICE_TYPE_ID = '1';

/**
 * HTTP Controller handling Dealership discovery, slot availability queries,
 * and technician lookups for customer and staff booking flows with offset pagination & optional filters.
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
  @ApiOperation({ summary: 'List all operational dealerships for the active tenant with offset pagination and optional code/name filters' })
  public async listDealerships(
    @Query() queryDto: DealershipQueryDto,
  ): Promise<ApiResponseEnvelope<Dealership[]>> {
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);

    if (queryDto.cursor) {
      CursorPaginationHelper.decode(queryDto.cursor);
      const result = await this.dealershipService.listDealershipsPaginated(tenantId, {
        cursor: queryDto.cursor,
        limit: queryDto.limit,
      });
      return ApiResponse.cursorPaginated(result.items, result.meta);
    }

    const result = await this.dealershipService.listDealershipsOffsetPaginated(queryDto, { tenantId });
    return ApiResponse.offsetPaginated(result);
  }

  @Get(':id/available-slots')
  @ApiOperation({
    summary:
      'Retrieve all available slots and service types for a dealership on a given date, including available technician details per slot',
  })
  public async getAvailableSlots(
    @Param('id') id: string,
    @Query() queryDto: AvailableSlotsQueryDto,
  ): Promise<DealershipAvailableSlotsResponseDto> {
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);
    const targetDate = queryDto.date ?? BENCHMARK_DATE;
    const targetServiceType = queryDto.serviceTypeId ?? queryDto.service_type_id;

    return this.availabilityService.getDealershipAvailableSlots(
      tenantId,
      id,
      targetDate,
      targetServiceType,
    );
  }

  @Get(':id/availability')
  @ApiOperation({
    summary:
      'Query slot grid availability and free technicians for a specific dealership, service type, and date',
  })
  public async getAvailability(
    @Param('id') id: string,
    @Query() queryDto: AvailabilityQueryDto,
  ): Promise<AvailabilityResponseDto> {
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);
    const targetDate = queryDto.date ?? BENCHMARK_DATE;
    const targetServiceType = queryDto.service_type_id ?? queryDto.serviceTypeId ?? DEFAULT_SERVICE_TYPE_ID;

    return this.availabilityService.getAvailability(tenantId, id, targetServiceType, targetDate);
  }

  @Get(':id/technicians')
  @ApiOperation({
    summary:
      'Query technicians for a specific dealership with optional filters (code, name, slot) and offset pagination',
  })
  public async getTechnicians(
    @Param('id') id: string,
    @Query() queryDto: TechnicianQueryDto,
  ): Promise<ApiResponseEnvelope<Technician[]>> {
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);
    const serviceTypeId = queryDto.service_type_id ?? queryDto.serviceTypeId;

    if (serviceTypeId && queryDto.start_at) {
      const slotResult = await this.availabilityService.getTechniciansForSlot(
        tenantId,
        id,
        serviceTypeId,
        queryDto.start_at,
      );

      if (queryDto.cursor) {
        const paginated = CursorPaginationHelper.paginateArray(slotResult.technicians, {
          cursor: queryDto.cursor,
          limit: queryDto.limit,
        });
        return ApiResponse.cursorPaginated(paginated.items, paginated.meta);
      }

      const paginated = OffsetPaginationHelper.paginateArray(slotResult.technicians, {
        page: queryDto.page,
        limit: queryDto.limit,
      });
      return ApiResponse.offsetPaginated(paginated);
    }

    // List all dealership technicians from Redis Hash Cache / DB with optional code/name filtering
    let technicians = this.workshopCache
      ? await this.workshopCache.getTechnicians(id, tenantId)
      : [];

    if (queryDto.code) {
      const filterCode = queryDto.code.toLowerCase().trim();
      technicians = technicians.filter((t) => t.code?.toLowerCase().includes(filterCode));
    }

    if (queryDto.name) {
      const filterName = queryDto.name.toLowerCase().trim();
      technicians = technicians.filter((t) => t.name?.toLowerCase().includes(filterName));
    }

    if (queryDto.cursor) {
      const paginated = CursorPaginationHelper.paginateArray(technicians, {
        cursor: queryDto.cursor,
        limit: queryDto.limit,
      });
      return ApiResponse.cursorPaginated(paginated.items, paginated.meta);
    }

    const paginated = OffsetPaginationHelper.paginateArray(technicians, {
      page: queryDto.page,
      limit: queryDto.limit,
    });

    return ApiResponse.offsetPaginated(paginated);
  }
}
