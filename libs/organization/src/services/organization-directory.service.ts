import { Injectable } from '@nestjs/common';
import {
  DealershipDirectoryDto,
  IOrganizationDirectoryContract,
  StaffDirectoryDto,
} from '@app/contracts';
import { DealershipRepository } from '../repositories/dealership.repository';
import { StaffRepository } from '../repositories/staff.repository';

@Injectable()
export class OrganizationDirectoryService implements IOrganizationDirectoryContract {
  public constructor(
    private readonly dealershipRepo: DealershipRepository,
    private readonly staffRepo: StaffRepository,
  ) {}

  public async findDealershipById(
    dealershipId: string,
    tenantId: string = '1',
  ): Promise<DealershipDirectoryDto | null> {
    const dealership = await this.dealershipRepo.findById({
      id: dealershipId,
      tenantId,
    });
    if (!dealership) {
      return null;
    }
    return {
      id: dealership.id,
      tenantId: dealership.tenantId,
      code: dealership.code ?? '',
      name: dealership.name,
      address: dealership.address,
      timezone: dealership.timezone,
    };
  }

  public async listDealerships(tenantId: string = '1'): Promise<DealershipDirectoryDto[]> {
    const list = await this.dealershipRepo.findAll(tenantId);
    return list.map((d) => ({
      id: d.id,
      tenantId: d.tenantId,
      code: d.code ?? '',
      name: d.name,
      address: d.address,
      timezone: d.timezone,
    }));
  }

  public async findStaffBySubject(
    identitySubject: string,
    tenantId: string = '1',
  ): Promise<StaffDirectoryDto | null> {
    const staff = await this.staffRepo.findByIdentitySubject(identitySubject, tenantId);
    if (!staff) {
      return null;
    }
    return {
      id: staff.id,
      tenantId: staff.tenantId,
      dealershipId: staff.dealershipId,
      identitySubject: staff.identitySubject,
      name: staff.name,
    };
  }
}
