import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponse, ApiResponseEnvelope, CursorPaginationDto, RequestContextService } from '@app/common';
import {
  CRM_DIRECTORY_CONTRACT,
  ICrmDirectoryContract,
  VehicleSnapshotDto,
} from '@app/contracts';

/**
 * Controller exposing endpoints for the currently authenticated customer's vehicles.
 * Pure HTTP Adapter delegating directly to the CRM directory service with cursor-based pagination.
 */
@ApiTags('Customer')
@Controller({ path: 'v1/me/vehicles' })
export class CustomerVehiclesController {
  public constructor(
    @Inject(CRM_DIRECTORY_CONTRACT)
    private readonly crmDirectory: ICrmDirectoryContract,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all vehicles registered to the currently authenticated customer with cursor pagination' })
  public async listMyVehicles(
    @Query() paginationDto: CursorPaginationDto,
  ): Promise<ApiResponseEnvelope<VehicleSnapshotDto[]>> {
    const actorSub = RequestContextService.getActorSub() ?? 'a1111111-1111-1111-1111-111111111111';
    const tenantId = String(RequestContextService.getTenantId() ?? 1);
    const result = await this.crmDirectory.listVehiclesByActorSubPaginated(actorSub, tenantId, paginationDto);
    return ApiResponse.cursorPaginated(result.items, result.meta);
  }
}
