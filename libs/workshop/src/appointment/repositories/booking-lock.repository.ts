import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { LOCK_TIMEOUT_DEFAULT, STATEMENT_TIMEOUT_DEFAULT } from '@app/common';

@Injectable()
export class BookingLockRepository {
  public async setSessionTimeouts(
    manager: EntityManager,
    lockTimeout: string = LOCK_TIMEOUT_DEFAULT,
    statementTimeout: string = STATEMENT_TIMEOUT_DEFAULT,
  ): Promise<void> {
    await manager.query(`SET LOCAL lock_timeout = '${lockTimeout}'`);
    await manager.query(`SET LOCAL statement_timeout = '${statementTimeout}'`);
  }

  public async acquireCustomerLock(
    manager: EntityManager,
    customerId: string,
  ): Promise<void> {
    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('customer:' || $1::text, 0))",
      [customerId],
    );
  }

  public async acquireDealershipLock(
    manager: EntityManager,
    dealershipId: string,
  ): Promise<void> {
    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('dealership:' || $1::text, 0))",
      [dealershipId],
    );
  }
}
