import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  UserPreference,
  CarListing,
  AuctionReminder,
} from '../database/entities';
import { CopartModule } from '../copart/copart.module';
import { BotModule } from '../bot/bot.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([UserPreference, CarListing, AuctionReminder]),
    CopartModule,
    forwardRef(() => BotModule), // Use forwardRef to resolve circular dependency
  ],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
