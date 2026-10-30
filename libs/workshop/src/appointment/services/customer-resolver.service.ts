import { Inject, Injectable } from '@nestjs/common';
import {
  ForbiddenDomainException,
  ResourceNotFoundException,
} from '@app/common';
import {
  CRM_DIRECTORY_CONTRACT,
  CustomerSnapshotDto,
  ICrmDirectoryContract,
  VehicleSnapshotDto,
} from '@app/contracts';
import { ActorContext } from '../actor-context';

@Injectable()
export class CustomerResolverService {
  public constructor(
    @Inject(CRM_DIRECTORY_CONTRACT)
    private readonly crmDirectory: ICrmDirectoryContract,
  ) {}

  public async resolve(
    actorOrSub: ActorContext | string,
    tenantIdParam?: string,
  ): Promise<CustomerSnapshotDto> {
    const actorSub = typeof actorOrSub === 'string' ? actorOrSub : actorOrSub.actorSub;
    const tenantId = typeof actorOrSub === 'string' ? tenantIdParam : actorOrSub.tenantId;

    if (!tenantId) {
      throw new ForbiddenDomainException('Missing tenant context');
    }

    const customer = await this.crmDirectory.findCustomerBySubject(
      actorSub,
      tenantId,
    );

    if (!customer) {
      throw new ForbiddenDomainException('Customer identity could not be resolved from token');
    }

    return customer;
  }

  public async requireVehicle(
    vehicleId: string,
    customerId: string,
    tenantId: string,
  ): Promise<VehicleSnapshotDto> {
    const vehicle = await this.crmDirectory.findVehicleOwnedByCustomer(
      vehicleId,
      customerId,
      tenantId,
    );

    if (!vehicle) {
      throw new ResourceNotFoundException(
        `Vehicle ${vehicleId} not found or does not belong to the authenticated customer`,
      );
    }
    return vehicle;
  }
}
