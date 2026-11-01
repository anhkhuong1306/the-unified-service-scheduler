import { DEFAULT_TENANT_ID } from '@app/common';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaffMember } from '../entities/staff-member.entity';

@Injectable()
export class StaffRepository {
  public constructor(
    @InjectRepository(StaffMember)
    private readonly repo: Repository<StaffMember>,
  ) {}

  public async findById(id: string, tenantId: string = DEFAULT_TENANT_ID): Promise<StaffMember | null> {
    return this.repo.findOne({
      where: { id, tenantId },
    });
  }

  public async findByIdentitySubject(identitySubject: string, tenantId: string = DEFAULT_TENANT_ID): Promise<StaffMember | null> {
    return this.repo.findOne({
      where: { identitySubject, tenantId },
    });
  }

  public async save(staffMember: StaffMember): Promise<StaffMember> {
    return this.repo.save(staffMember);
  }
}
