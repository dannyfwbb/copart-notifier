import { Injectable } from '@nestjs/common';
import { SchedulerService } from './scheduler/scheduler.service';
import { CopartService } from './copart/copart.service';

@Injectable()
export class AppService {
  constructor(
    private readonly schedulerService: SchedulerService,
    private readonly copartService: CopartService
  ) {}

  getData(): { message: string } {
    return { message: 'Hello API' };
  }
}
