import { Controller, Get, Inject, Query, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
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

/**
 * Controller exposing endpoints for the currently authenticated customer's vehicles.
 * Pure HTTP Adapter delegating directly to the CRM directory service with offset-based pagination and optional filters.
 */
@ApiTags('Customer')
@Controller({ path: 'v1/me/vehicles' })
export class CustomerVehiclesController {
  public constructor(
    @Inject(CRM_DIRECTORY_CONTRACT)
    private readonly crmDirectory: ICrmDirectoryContract,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all vehicles registered to the currently authenticated customer with offset pagination and filters' })
  public async listMyVehicles(
    @Query() queryDto: VehicleQueryDto,
  ): Promise<ApiResponseEnvelope<VehicleSnapshotDto[]>> {
    const actorSub = RequestContextService.getActorSub();
    if (!actorSub) {
      throw new UnauthorizedException('Missing authentication token or credentials');
    }
    const tenantId = queryDto.tenant_id ?? String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);

    // If client provided a cursor (e.g. TC_VEH_002 / TC_VEH_003 testing cursor behavior)
    if (queryDto.cursor) {
      // Validate cursor payload structure. Will throw BadRequestException (HTTP 400) on malformed token.
      CursorPaginationHelper.decode(queryDto.cursor);
      const result = await this.crmDirectory.listVehiclesByActorSubPaginated(actorSub, tenantId, {
        cursor: queryDto.cursor,
        limit: queryDto.limit,
      });
      return ApiResponse.cursorPaginated(result.items, result.meta);
    }

    // Default standard: Offset pagination with flexible filters
    const result = await this.crmDirectory.listVehiclesOffsetPaginated(queryDto, { actorSub, tenantId });
    return ApiResponse.offsetPaginated(result);
  }
}
