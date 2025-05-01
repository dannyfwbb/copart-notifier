import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UserPreference,
  CarListing,
  AuctionReminder,
} from '../database/entities';
import { Command, Ctx, Start, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { BotService } from './bot.service';

@Update()
@Injectable()
export class BotUpdate {
  private readonly logger = new Logger(BotUpdate.name);

  constructor(
    @InjectRepository(UserPreference)
    private userPreferenceRepository: Repository<UserPreference>,
    @InjectRepository(CarListing)
    private carListingRepository: Repository<CarListing>,
    @InjectRepository(AuctionReminder)
    private auctionReminderRepository: Repository<AuctionReminder>,
    private botService: BotService
  ) {}

  @Start()
  async start(@Ctx() ctx: Context) {
    const chatId = ctx.chat.id;

    // Check if user already exists
    let user = await this.userPreferenceRepository.findOne({
      where: { chatId },
    });

    if (!user) {
      // Create new user preference
      user = this.userPreferenceRepository.create({
        chatId,
        schedule: '0 * * * *', // Default to every hour
        isActive: true,
        lastNotificationTime: new Date(), // Initialize to current time
      });
      await this.userPreferenceRepository.save(user);
    } else if (!user.isActive) {
      // Reactivate user if they were inactive
      user.isActive = true;
      await this.userPreferenceRepository.save(user);
    }

    return `Welcome to Copart Car Notifier Bot! 🚗\n\nYou will receive notifications about new car listings every hour.\n\nAvailable commands:\n/help - Show available commands\n/update - Manually check for new car listings\n/setschedule - Set notification schedule using cron expression\n/status - Show current notification settings`;
  }

  @Command('help')
  async help() {
    return `Copart Car Notifier Bot Commands:

Basic Commands:
/start - Start receiving notifications
/update - Manually check for new car listings
/setschedule [cron] - Set notification schedule using cron expression (e.g., /setschedule 0 */2 * * * for every 2 hours)
/status - Show current notification settings
/stop - Stop receiving notifications

Auction Reminders:
/remind [listing_id] [time] - Set a reminder for a specific listing (e.g., /remind 12345 1h for 1 hour before auction)
/reminders - List all active reminders
/cancelreminder [reminder_id] - Cancel a specific reminder

Car Information:
/details [listing_id] - View detailed information about a specific listing`;
  }

  @Command('update')
  async update(@Ctx() ctx: Context) {
    const chatId = ctx.chat.id;

    // Check if user exists
    const user = await this.userPreferenceRepository.findOne({
      where: { chatId },
    });

    if (!user) {
      return 'You are not registered for notifications. Use /start to register.';
    }

    if (!user.isActive) {
      return 'Your notifications are currently disabled. Use /start to enable notifications.';
    }

    // Send initial response
    await ctx.reply('Checking for new car listings...');

    // Trigger manual update
    return this.botService.triggerManualUpdate(chatId);
  }

  @Command('setschedule')
  async setSchedule(@Ctx() ctx: Context) {
    const chatId = ctx.chat.id;

    // Check if message exists and has text property
    if (!ctx.message || !('text' in ctx.message)) {
      return 'Invalid message format. Please send a text message with the command.';
    }

    const messageText = ctx.message.text;
    const parts = messageText.split(' ');

    if (parts.length < 2) {
      return 'Please provide a valid cron expression. Example: /setschedule 0 */2 * * * (for every 2 hours)';
    }

    const cronExpression = parts.slice(1).join(' ');

    // Validate cron expression (basic validation)
    if (!this.isValidCronExpression(cronExpression)) {
      return 'Invalid cron expression. Please use a valid format like: 0 */2 * * * (for every 2 hours)';
    }

    // Update user preference
    const user = await this.userPreferenceRepository.findOne({
      where: { chatId },
    });

    if (!user) {
      return 'Please use /start command first to register for notifications.';
    }

    user.schedule = cronExpression;
    await this.userPreferenceRepository.save(user);

    return `Notification schedule updated to: ${cronExpression}`;
  }

  @Command('status')
  async status(@Ctx() ctx: Context) {
    const chatId = ctx.chat.id;

    const user = await this.userPreferenceRepository.findOne({
      where: { chatId },
    });

    if (!user) {
      return 'You are not registered for notifications. Use /start to register.';
    }

    return `Current notification settings:\nSchedule: ${
      user.schedule
    }\nStatus: ${user.isActive ? 'Active' : 'Inactive'}`;
  }

  @Command('stop')
  async stop(@Ctx() ctx: Context) {
    const chatId = ctx.chat.id;

    const user = await this.userPreferenceRepository.findOne({
      where: { chatId },
    });

    if (!user) {
      return 'You are not registered for notifications.';
    }

    user.isActive = false;
    await this.userPreferenceRepository.save(user);

    return 'Notifications stopped. Use /start to resume notifications.';
  }

  @Command('remind')
  async setReminder(@Ctx() ctx: Context) {
    const chatId = ctx.chat.id;

    // Check if message exists and has text property
    if (!ctx.message || !('text' in ctx.message)) {
      return 'Invalid message format. Please send a text message with the command.';
    }

    const messageText = ctx.message.text;
    const parts = messageText.split(' ');

    if (parts.length < 2) {
      return 'Please provide a listing ID. Example: /remind 12345 1h (for 1 hour before auction)';
    }

    const listingId = parts[1];
    let reminderOffset = 60; // Default to 1 hour (60 minutes)

    if (parts.length >= 3) {
      const timeStr = parts[2].toLowerCase();
      if (timeStr.endsWith('h')) {
        const hours = parseInt(timeStr.slice(0, -1));
        if (!isNaN(hours)) {
          reminderOffset = hours * 60;
        }
      } else if (timeStr.endsWith('m')) {
        const minutes = parseInt(timeStr.slice(0, -1));
        if (!isNaN(minutes)) {
          reminderOffset = minutes;
        }
      } else if (timeStr.endsWith('d')) {
        const days = parseInt(timeStr.slice(0, -1));
        if (!isNaN(days)) {
          reminderOffset = days * 24 * 60;
        }
      }
    }

    // Find the listing
    const listing = await this.carListingRepository.findOne({
      where: { listingId },
    });

    if (!listing) {
      return `Listing with ID ${listingId} not found.`;
    }

    // Calculate reminder time
    const auctionDate = new Date(listing.auctionDate);
    const reminderTime = new Date(
      auctionDate.getTime() - reminderOffset * 60000
    );

    // Check if reminder time is in the past
    if (reminderTime <= new Date()) {
      return `Cannot set a reminder for the past. The auction is scheduled for ${auctionDate.toLocaleString()}.`;
    }

    // Check if a reminder already exists
    const existingReminder = await this.auctionReminderRepository.findOne({
      where: { chatId, listingId, sent: false },
    });

    if (existingReminder) {
      existingReminder.reminderTime = reminderTime;
      await this.auctionReminderRepository.save(existingReminder);
      return `Reminder updated for listing ${listingId}. You will be notified on ${reminderTime.toLocaleString()}.`;
    }

    // Create a new reminder
    const reminder = this.auctionReminderRepository.create({
      chatId,
      listingId,
      reminderTime,
    });

    await this.auctionReminderRepository.save(reminder);

    return `Reminder set for listing ${listingId}. You will be notified on ${reminderTime.toLocaleString()}.`;
  }

  @Command('reminders')
  async listReminders(@Ctx() ctx: Context) {
    const chatId = ctx.chat.id;

    // Find all active reminders for this user
    const reminders = await this.auctionReminderRepository.find({
      where: { chatId, sent: false },
      relations: ['listing'],
    });

    if (reminders.length === 0) {
      return 'You have no active reminders.';
    }

    let message = 'Your active reminders:\n\n';
    for (const reminder of reminders) {
      const listing = reminder.listing;
      message += `ID: ${reminder.id}\n`;
      message += `Listing: ${listing.year} ${listing.model}\n`;
      message += `Auction: ${new Date(listing.auctionDate).toLocaleString()}\n`;
      message += `Reminder: ${new Date(
        reminder.reminderTime
      ).toLocaleString()}\n\n`;
    }

    message += 'To cancel a reminder, use /cancelreminder [reminder_id]';
    return message;
  }

  @Command('cancelreminder')
  async cancelReminder(@Ctx() ctx: Context) {
    const chatId = ctx.chat.id;

    // Check if message exists and has text property
    if (!ctx.message || !('text' in ctx.message)) {
      return 'Invalid message format. Please send a text message with the command.';
    }

    const messageText = ctx.message.text;
    const parts = messageText.split(' ');

    if (parts.length < 2) {
      return 'Please provide a reminder ID. Example: /cancelreminder 12345';
    }

    const reminderId = parts[1];

    // Find the reminder
    const reminder = await this.auctionReminderRepository.findOne({
      where: { id: reminderId, chatId, sent: false },
    });

    if (!reminder) {
      return `Reminder with ID ${reminderId} not found.`;
    }

    // Delete the reminder
    await this.auctionReminderRepository.remove(reminder);

    return `Reminder with ID ${reminderId} has been cancelled.`;
  }

  @Command('details')
  async getDetails(@Ctx() ctx: Context) {
    // Check if message exists and has text property
    if (!ctx.message || !('text' in ctx.message)) {
      return 'Invalid message format. Please send a text message with the command.';
    }

    const messageText = ctx.message.text;
    const parts = messageText.split(' ');

    if (parts.length < 2) {
      return 'Please provide a listing ID. Example: /details 12345';
    }

    const listingId = parts[1];

    // Find the listing
    const listing = await this.carListingRepository.findOne({
      where: { listingId },
    });

    if (!listing) {
      return `Listing with ID ${listingId} not found.`;
    }

    // Format the message
    const message = this.botService.formatCarListingMessage(listing);

    // Send the message
    if (listing.imageUrl) {
      await ctx.replyWithPhoto(listing.imageUrl, {
        caption: message,
        parse_mode: 'HTML',
      });
    } else {
      await ctx.reply(message, { parse_mode: 'HTML' });
    }

    return null;
  }

  private isValidCronExpression(cron: string): boolean {
    // Basic validation - check if it has 5 or 6 parts
    const parts = cron.trim().split(/\s+/);
    return parts.length >= 5 && parts.length <= 6;
  }
}
