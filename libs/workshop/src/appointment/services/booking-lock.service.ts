import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

@Injectable()
export class BookingLockService {
  public async setLocalTimeouts(manager: EntityManager): Promise<void> {
    await manager.query("SET LOCAL lock_timeout = '2s'");
    await manager.query("SET LOCAL statement_timeout = '5s'");
  }

  public async lockCustomer(manager: EntityManager, customerId: string): Promise<void> {
    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('customer:' || $1::text, 0))",
      [customerId],
    );
  }

  public async lockDealership(manager: EntityManager, dealershipId: string): Promise<void> {
    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('dealership:' || $1::text, 0))",
      [dealershipId],
    );
  }
}
