import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiResponse,
  ApiResponseEnvelope,
  CursorPaginationHelper,
  RequestContextService,
  DEFAULT_TENANT_ID,
} from '@app/common';
import { ServiceCatalogService, ServiceType } from '@app/workshop';
import { ServiceTypeQueryDto } from './dto';

@ApiTags('Service Catalog')
@Controller({ path: 'v1/service-types' })
export class ServiceTypesController {
  public constructor(
    private readonly serviceCatalogService: ServiceCatalogService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all active service types for the current tenant with offset pagination and optional code/name filters' })
  public async listServiceTypes(
    @Query() queryDto: ServiceTypeQueryDto,
  ): Promise<ApiResponseEnvelope<ServiceType[]>> {
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);

    if (queryDto.cursor) {
      CursorPaginationHelper.decode(queryDto.cursor);
      const result = await this.serviceCatalogService.listServiceTypesPaginated(tenantId, {
        cursor: queryDto.cursor,
        limit: queryDto.limit,
      });
      return ApiResponse.cursorPaginated(result.items, result.meta);
    }

    const result = await this.serviceCatalogService.listServiceTypesOffsetPaginated(queryDto, { tenantId });
    return ApiResponse.offsetPaginated(result);
  }
}
