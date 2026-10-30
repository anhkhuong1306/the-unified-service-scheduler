import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class ReferenceCodeGenerator {
  public generate(date: Date): string {
    const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
    // 8 cryptographically secure alphanumeric characters (avoiding easily confused chars)
    const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `APT-${datePart}-${randomPart}`;
  }
}
