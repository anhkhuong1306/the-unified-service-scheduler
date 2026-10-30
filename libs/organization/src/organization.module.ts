import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ORGANIZATION_DIRECTORY_CONTRACT } from '@app/contracts';
import { Dealership } from './dealership/dealership.entity';
import { StaffMember } from './staff/staff-member.entity';
import { OrganizationDirectoryService } from './organization-directory.service';
import { DealershipService } from './dealership/dealership.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Dealership, StaffMember])],
  controllers: [],
  providers: [
    OrganizationDirectoryService,
    DealershipService,
    {
      provide: ORGANIZATION_DIRECTORY_CONTRACT,
      useExisting: OrganizationDirectoryService,
    },
  ],
  exports: [ORGANIZATION_DIRECTORY_CONTRACT, OrganizationDirectoryService, DealershipService, TypeOrmModule],
})
export class OrganizationModule {}
