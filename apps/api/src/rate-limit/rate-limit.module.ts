import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { RateLimitExceededFilter } from './rate-limit.filter';
import { RateLimitService } from './rate-limit.service';

@Global()
@Module({
  providers: [
    RateLimitService,
    { provide: APP_FILTER, useClass: RateLimitExceededFilter },
  ],
  exports: [RateLimitService],
})
export class RateLimitModule {}
