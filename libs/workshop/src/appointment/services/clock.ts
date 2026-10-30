import { Injectable } from '@nestjs/common';

@Injectable()
export class Clock {
  public now(): Date {
    return new Date();
  }
}
