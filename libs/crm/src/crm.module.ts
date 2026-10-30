import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CRM_DIRECTORY_CONTRACT } from '@app/contracts';
import { Customer } from './customer/customer.entity';
import { Vehicle } from './vehicle/vehicle.entity';
import { CrmDirectoryService } from './crm-directory.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Customer, Vehicle])],
  controllers: [],
  providers: [
    CrmDirectoryService,
    {
      provide: CRM_DIRECTORY_CONTRACT,
      useExisting: CrmDirectoryService,
    },
  ],
  exports: [CRM_DIRECTORY_CONTRACT, CrmDirectoryService, TypeOrmModule],
})
export class CrmModule {}
