import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiResponse,
  ApiResponseEnvelope,
  RequestContextService,
} , DEFAULT_TENANT_ID } from '@app/common';
import {
  CRM_DIRECTORY_CONTRACT,
  CustomerSnapshotDto,
  ICrmDirectoryContract,
} from '@app/contracts';
import { CustomerQueryDto } from './dto';

@ApiTags('Customers')
@Controller({ path: 'v1/customers' })
export class CustomersController {
  public constructor(
    @Inject(CRM_DIRECTORY_CONTRACT)
    private readonly crmDirectory: ICrmDirectoryContract,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List customers with offset pagination and optional code/name filters' })
  public async listCustomers(
    @Query() queryDto: CustomerQueryDto,
  ): Promise<ApiResponseEnvelope<CustomerSnapshotDto[]>> {
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);
    const result = await this.crmDirectory.listCustomersOffsetPaginated(queryDto, { tenantId });
    return ApiResponse.offsetPaginated(result);
  }
}
