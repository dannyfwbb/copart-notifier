import { Module, forwardRef } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  UserPreference,
  CarListing,
  AuctionReminder,
} from '../database/entities';
import { ConfigService } from '@nestjs/config';
import { BotService } from './bot.service';
import { BotUpdate } from './bot.update';
import { SchedulerModule } from '../scheduler/scheduler.module';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        token: configService.get<string>('TELEGRAM_BOT_TOKEN'),
      }),
    }),
    TypeOrmModule.forFeature([UserPreference, CarListing, AuctionReminder]),
    forwardRef(() => SchedulerModule), // Use forwardRef to resolve circular dependency
  ],
  providers: [BotService, BotUpdate],
  exports: [BotService],
})
export class BotModule {}
