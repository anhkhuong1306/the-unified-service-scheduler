import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { BookingLockRepository } from '../repositories/booking-lock.repository';

@Injectable()
export class BookingLockService {
  public constructor(
    private readonly lockRepo: BookingLockRepository,
  ) {}

  public async setLocalTimeouts(manager: EntityManager): Promise<void> {
    await this.lockRepo.setSessionTimeouts(manager, '2s', '5s');
  }

  public async lockCustomer(manager: EntityManager, customerId: string): Promise<void> {
    await this.lockRepo.acquireCustomerLock(manager, customerId);
  }

  public async lockDealership(manager: EntityManager, dealershipId: string): Promise<void> {
    await this.lockRepo.acquireDealershipLock(manager, dealershipId);
  }
}
