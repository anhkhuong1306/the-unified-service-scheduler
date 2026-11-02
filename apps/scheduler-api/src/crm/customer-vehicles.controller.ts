import { Controller, Get, Inject, Query, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiDocErrors,
  ApiDocPaginated,
  ApiResponse,
  ApiResponseEnvelope,
  CursorPaginationHelper,
  RequestContextService,
  DEFAULT_TENANT_ID,
} from '@app/common';
import {
  CRM_DIRECTORY_CONTRACT,
  ICrmDirectoryContract,
  VehicleSnapshotDto,
} from '@app/contracts';
import { VehicleQueryDto } from '@app/crm';
import { SAMPLE_VEHICLE } from './samples/crm-swagger.samples';

/**
 * Controller exposing endpoints for the currently authenticated customer's vehicles.
 * Pure HTTP Adapter delegating directly to the CRM directory service with offset-based pagination and optional filters.
 */
@ApiTags('Customer')
@ApiBearerAuth()
@Controller({ path: 'v1/me/vehicles' })
export class CustomerVehiclesController {
  public constructor(
    @Inject(CRM_DIRECTORY_CONTRACT)
    private readonly crmDirectory: ICrmDirectoryContract,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all vehicles registered to the currently authenticated customer with offset pagination and filters' })
  @ApiDocPaginated({
    description: 'Customer vehicles returned successfully with offset pagination',
    exampleItem: SAMPLE_VEHICLE,
    total: 1,
  })
  @ApiDocErrors([400, 401, 500])
  public async listMyVehicles(
    @Query() queryDto: VehicleQueryDto,
  ): Promise<ApiResponseEnvelope<VehicleSnapshotDto[]>> {
    const actorSub = RequestContextService.getActorSub();
    if (!actorSub) {
      throw new UnauthorizedException('Missing authentication token or credentials');
    }
    const tenantId = queryDto.tenantId ?? String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);

    if (queryDto.cursor) {
      CursorPaginationHelper.decode(queryDto.cursor);
      const result = await this.crmDirectory.listVehiclesByActorSubPaginated(actorSub, tenantId, {
        cursor: queryDto.cursor,
        limit: queryDto.limit,
      });
      return ApiResponse.cursorPaginated(result.items, result.meta);
    }

    const result = await this.crmDirectory.listVehiclesOffsetPaginated(queryDto, { actorSub, tenantId });
    return ApiResponse.offsetPaginated(result);
  }
}
