import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ORGANIZATION_DIRECTORY_CONTRACT } from '@app/contracts';
import { Dealership, StaffMember } from './entities';
import { OrganizationDirectoryService, DealershipService } from './services';
import { DealershipRepository, StaffRepository } from './repositories';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Dealership, StaffMember])],
  controllers: [],
  providers: [
    DealershipRepository,
    StaffRepository,
    OrganizationDirectoryService,
    DealershipService,
    {
      provide: ORGANIZATION_DIRECTORY_CONTRACT,
      useExisting: OrganizationDirectoryService,
    },
  ],
  exports: [
    ORGANIZATION_DIRECTORY_CONTRACT,
    OrganizationDirectoryService,
    DealershipService,
    DealershipRepository,
    StaffRepository,
    TypeOrmModule,
  ],
})
export class OrganizationModule {}
