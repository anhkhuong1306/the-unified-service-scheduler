import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CRM_DIRECTORY_CONTRACT } from '@app/contracts';
import { Customer, Vehicle } from './entities';
import { CustomerRepository, VehicleRepository } from './repositories';
import { CrmDirectoryService } from './services';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Customer, Vehicle])],
  controllers: [],
  providers: [
    CustomerRepository,
    VehicleRepository,
    CrmDirectoryService,
    {
      provide: CRM_DIRECTORY_CONTRACT,
      useExisting: CrmDirectoryService,
    },
  ],
  exports: [
    CRM_DIRECTORY_CONTRACT,
    CrmDirectoryService,
    CustomerRepository,
    VehicleRepository,
    TypeOrmModule,
  ],
})
export class CrmModule {}
