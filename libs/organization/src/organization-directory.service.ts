import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DealershipDirectoryDto,
  IOrganizationDirectoryContract,
  StaffDirectoryDto,
} from '@app/contracts';
import { Dealership } from './dealership/dealership.entity';
import { StaffMember } from './staff/staff-member.entity';

@Injectable()
export class OrganizationDirectoryService implements IOrganizationDirectoryContract {
  public constructor(
    @InjectRepository(Dealership)
    private readonly dealershipRepo: Repository<Dealership>,
    @InjectRepository(StaffMember)
    private readonly staffRepo: Repository<StaffMember>,
  ) {}

  public async findDealershipById(
    dealershipId: string,
    tenantId: string = '1',
  ): Promise<DealershipDirectoryDto | null> {
    const dealership = await this.dealershipRepo.findOne({
      where: { id: dealershipId, tenantId },
    });
    if (!dealership) {
      return null;
    }
    return {
      id: dealership.id,
      tenantId: dealership.tenantId,
      name: dealership.name,
      address: dealership.address,
      timezone: dealership.timezone,
    };
  }

  public async listDealerships(tenantId: string = '1'): Promise<DealershipDirectoryDto[]> {
    const list = await this.dealershipRepo.find({
      where: { tenantId },
      order: { id: 'ASC' },
    });
    return list.map((d) => ({
      id: d.id,
      tenantId: d.tenantId,
      name: d.name,
      address: d.address,
      timezone: d.timezone,
    }));
  }

  public async findStaffBySubject(
    identitySubject: string,
    tenantId: string = '1',
  ): Promise<StaffDirectoryDto | null> {
    const staff = await this.staffRepo.findOne({
      where: { identitySubject, tenantId },
    });
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
