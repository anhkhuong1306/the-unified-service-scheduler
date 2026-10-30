import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequestContextService } from '@app/common';
import { ServiceCatalogService, ServiceType } from '@app/workshop';

@ApiTags('Service Catalog')
@Controller({ path: 'v1/service-types' })
export class ServiceTypesController {
  public constructor(
    private readonly serviceCatalogService: ServiceCatalogService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all active service types for the current tenant' })
  public async listServiceTypes(): Promise<ServiceType[]> {
    const tenantId = String(RequestContextService.getTenantId() ?? 1);
    return this.serviceCatalogService.listServiceTypes(tenantId);
  }
}
