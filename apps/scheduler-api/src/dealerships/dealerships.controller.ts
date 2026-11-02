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
  DEFAULT_TENANT_ID,
} from '@app/common';
import { Dealership, DealershipService } from '@app/organization';
import {
  AvailableTechnicianDto,
  DealershipAvailableSlotsResponseDto,
  ResourceAvailabilityService,
  Technician,
  WorkshopCacheService,
} from '@app/workshop';
import {
  AvailableSlotsQueryDto,
  DealershipQueryDto,
  TechnicianQueryDto,
} from './dto';

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
      'Retrieve all available slots and service types for a dealership with optional filters (service_type_ids, technician_ids, date) and offset pagination',
  })
  public async getAvailableSlots(
    @Param('id') id: string,
    @Query() queryDto: AvailableSlotsQueryDto,
  ): Promise<ApiResponseEnvelope<DealershipAvailableSlotsResponseDto>> {
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);

    const serviceTypeIds =
      queryDto.service_type_ids ??
      queryDto.serviceTypeIds ??
      (queryDto.service_type_id ? [queryDto.service_type_id] : undefined) ??
      (queryDto.serviceTypeId ? [queryDto.serviceTypeId] : undefined);

    const technicianIds =
      queryDto.technician_ids ??
      queryDto.technicianIds ??
      (queryDto.technician_id ? [queryDto.technician_id] : undefined) ??
      (queryDto.technicianId ? [queryDto.technicianId] : undefined);

    const result = await this.availabilityService.getDealershipAvailableSlots(
      tenantId,
      id,
      {
        date: queryDto.date,
        serviceTypeIds,
        technicianIds,
        page: queryDto.page,
        limit: queryDto.limit,
      },
    );

    const { meta, ...data } = result;
    return ApiResponse.build(200, null, data, 'OK', meta);
  }

  @Get(':id/technicians')
  @ApiOperation({
    summary:
      'Query technicians for a specific dealership with optional filters (code, name, slot) and offset pagination',
  })
  public async getTechnicians(
    @Param('id') id: string,
    @Query() queryDto: TechnicianQueryDto,
  ): Promise<ApiResponseEnvelope<Array<Technician | AvailableTechnicianDto>>> {
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
