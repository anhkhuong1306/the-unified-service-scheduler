import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequestContextService } from '@app/common';
import {
  CRM_DIRECTORY_CONTRACT,
  ICrmDirectoryContract,
  VehicleSnapshotDto,
} from '@app/contracts';

/**
 * Controller exposing endpoints for the currently authenticated customer's vehicles.
 * Pure HTTP Adapter delegating directly to the CRM directory service.
 */
@ApiTags('Customer')
@Controller({ path: 'v1/me/vehicles' })
export class CustomerVehiclesController {
  public constructor(
    @Inject(CRM_DIRECTORY_CONTRACT)
    private readonly crmDirectory: ICrmDirectoryContract,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all vehicles registered to the currently authenticated customer' })
  public async listMyVehicles(): Promise<VehicleSnapshotDto[]> {
    const actorSub = RequestContextService.getActorSub() ?? 'a1111111-1111-1111-1111-111111111111';
    const tenantId = String(RequestContextService.getTenantId() ?? 1);
    return this.crmDirectory.listVehiclesByActorSub(actorSub, tenantId);
  }
}
