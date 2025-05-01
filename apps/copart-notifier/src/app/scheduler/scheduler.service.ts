import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan } from 'typeorm';
import {
  UserPreference,
  CarListing,
  AuctionReminder,
} from '../database/entities';
import { CopartService } from '../copart/copart.service';
import { BotService } from '../bot/bot.service';
import { CronJob } from 'cron';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly DEFAULT_SCHEDULE = '0 * * * *'; // Every hour

  constructor(
    private schedulerRegistry: SchedulerRegistry,
    @InjectRepository(UserPreference)
    private userPreferenceRepository: Repository<UserPreference>,
    @InjectRepository(CarListing)
    private carListingRepository: Repository<CarListing>,
    @InjectRepository(AuctionReminder)
    private auctionReminderRepository: Repository<AuctionReminder>,
    private copartService: CopartService,
    @Inject(forwardRef(() => BotService))
    private botService: BotService
  ) {}

  async onModuleInit() {
    await this.setupScheduledJobs();

    // Set up reminder check job to run every 5 minutes
    const reminderJob = new CronJob('*/5 * * * *', () =>
      this.checkAndSendReminders()
    );
    this.schedulerRegistry.addCronJob('check-reminders', reminderJob);
    reminderJob.start();

    this.logger.log('Reminder check job scheduled to run every 5 minutes');
  }

  /**
   * Checks for due reminders and sends notifications
   */
  private async checkAndSendReminders(): Promise<void> {
    this.logger.log('Checking for auction reminders to send...');

    try {
      // Find all unsent reminders that are due
      const now = new Date();
      const dueReminders = await this.auctionReminderRepository.find({
        where: {
          sent: false,
          reminderTime: LessThan(now),
        },
        relations: ['listing'],
      });

      if (dueReminders.length === 0) {
        this.logger.log('No reminders due at this time');
        return;
      }

      this.logger.log(`Found ${dueReminders.length} reminders to send`);

      // Send reminders
      for (const reminder of dueReminders) {
        const { chatId, listing } = reminder;

        // Send the reminder
        await this.botService.sendAuctionReminder(chatId, reminder, listing);

        // Mark as sent
        reminder.sent = true;
        await this.auctionReminderRepository.save(reminder);

        this.logger.log(
          `Sent reminder for listing ${reminder.listingId} to user ${chatId}`
        );
      }
    } catch (error) {
      this.logger.error('Error checking and sending reminders', error.stack);
    }
  }

  async setupScheduledJobs() {
    // Get all active users with their schedules
    const activeUsers = await this.userPreferenceRepository.find({
      where: { isActive: true },
    });

    if (activeUsers.length === 0) {
      this.logger.log('No active users found. Setting up default job.');
      this.setupDefaultJob();
      return;
    }

    // Group users by schedule to avoid creating duplicate jobs
    const scheduleMap = new Map<string, number[]>();

    for (const user of activeUsers) {
      const schedule = user.schedule || this.DEFAULT_SCHEDULE;
      if (!scheduleMap.has(schedule)) {
        scheduleMap.set(schedule, []);
      }
      scheduleMap.get(schedule).push(user.chatId);
    }

    // Create a job for each unique schedule
    for (const [schedule, chatIds] of scheduleMap.entries()) {
      this.createJob(schedule, chatIds);
    }

    this.logger.log(`Set up ${scheduleMap.size} scheduled jobs`);
  }

  private setupDefaultJob() {
    this.createJob(this.DEFAULT_SCHEDULE, []);
    this.logger.log(
      `Set up default job with schedule: ${this.DEFAULT_SCHEDULE}`
    );
  }

  private createJob(schedule: string, chatIds: number[]) {
    const jobName = `fetch-listings-${schedule.replace(/\s+/g, '-')}`;

    try {
      // Remove existing job with the same name if it exists
      try {
        this.schedulerRegistry.deleteCronJob(jobName);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        // Job doesn't exist, which is fine
      }

      // Create new job
      const job = new CronJob(schedule, () => this.executeJob(chatIds));

      // Register the job
      this.schedulerRegistry.addCronJob(jobName, job);

      // Start the job
      job.start();

      this.logger.log(`Job ${jobName} created with schedule: ${schedule}`);
    } catch (error) {
      this.logger.error(`Error creating job ${jobName}: ${error.message}`);
    }
  }

  private async executeJob(chatIds: number[]) {
    this.logger.log('Executing scheduled job to fetch new car listings');

    try {
      // Fetch new listings from the API (this adds them to the database)
      await this.copartService.fetchNewListings();

      if (chatIds.length > 0) {
        // Send to specific chat IDs
        for (const chatId of chatIds) {
          // Get user preferences
          const user = await this.userPreferenceRepository.findOne({
            where: { chatId },
          });

          if (user && user.isActive) {
            // Query the database for ALL listings the user hasn't seen yet
            const userNewListings = await this.carListingRepository.find({
              where: user.lastNotificationTime
                ? { createdAt: MoreThan(user.lastNotificationTime) }
                : {},
              order: { createdAt: 'DESC' },
            });

            if (userNewListings.length > 0) {
              this.logger.log(
                `Found ${userNewListings.length} unseen listings for user ${chatId}`
              );
              await this.botService.sendBatchNotifications(
                chatId,
                userNewListings
              );
            }
          }
        }
      } else {
        // Send to all active users
        const activeUsers = await this.userPreferenceRepository.find({
          where: { isActive: true },
        });

        for (const user of activeUsers) {
          // Query the database for ALL listings the user hasn't seen yet
          const userNewListings = await this.carListingRepository.find({
            where: user.lastNotificationTime
              ? { createdAt: MoreThan(user.lastNotificationTime) }
              : {},
            order: { createdAt: 'DESC' },
          });

          if (userNewListings.length > 0) {
            this.logger.log(
              `Found ${userNewListings.length} unseen listings for user ${user.chatId}`
            );
            await this.botService.sendBatchNotifications(
              user.chatId,
              userNewListings
            );
          }
        }
      }
    } catch (error) {
      this.logger.error('Error executing scheduled job', error.stack);
    }
  }

  /**
   * Manually trigger an update for a specific user
   * @param chatId The chat ID of the user
   * @returns Object with success status and count of new listings
   */
  async executeManualUpdate(
    chatId: number
  ): Promise<{ success: boolean; count: number }> {
    this.logger.log(`Manual update triggered by user ${chatId}`);

    try {
      // First, fetch any new listings from the API (this adds them to the database)
      await this.copartService.fetchNewListings();

      // Get user preferences
      const user = await this.userPreferenceRepository.findOne({
        where: { chatId },
      });

      if (!user || !user.isActive) {
        this.logger.warn(`User ${chatId} not found or inactive`);
        return { success: false, count: 0 };
      }

      // Query the database for ALL listings the user hasn't seen yet
      const userNewListings = await this.carListingRepository.find({
        where: user.lastNotificationTime
          ? { createdAt: MoreThan(user.lastNotificationTime) }
          : {},
        order: { createdAt: 'DESC' },
      });

      this.logger.log(
        `Found ${userNewListings.length} unseen listings for user ${chatId}`
      );

      if (userNewListings.length > 0) {
        await this.botService.sendBatchNotifications(chatId, userNewListings);
        this.logger.log(
          `Sent ${userNewListings.length} new listings to user ${chatId}`
        );
      } else {
        this.logger.log(
          `No new listings for user ${chatId} since last notification`
        );
      }

      return { success: true, count: userNewListings.length };
    } catch (error) {
      this.logger.error(
        `Error executing manual update for user ${chatId}`,
        error.stack
      );
      return { success: false, count: 0 };
    }
  }

  async updateUserSchedule(chatId: number, schedule: string): Promise<boolean> {
    try {
      const user = await this.userPreferenceRepository.findOne({
        where: { chatId },
      });

      if (!user) {
        return false;
      }

      // Get the old schedule before updating
      const oldSchedule = user.schedule;

      // Update user schedule
      user.schedule = schedule;
      await this.userPreferenceRepository.save(user);

      // If the schedule hasn't changed, no need to update jobs
      if (oldSchedule === schedule) {
        return true;
      }

      // Find all users with the same old schedule
      const usersWithOldSchedule = await this.userPreferenceRepository.find({
        where: {
          schedule: oldSchedule,
          isActive: true,
        },
      });

      // Find all users with the same new schedule
      const usersWithNewSchedule = await this.userPreferenceRepository.find({
        where: {
          schedule: schedule,
          isActive: true,
        },
      });

      // If there are still users with the old schedule, update that job
      if (usersWithOldSchedule.length > 0) {
        const oldJobName = `fetch-listings-${oldSchedule.replace(/\s+/g, '-')}`;

        try {
          // Remove the old job
          this.schedulerRegistry.deleteCronJob(oldJobName);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
          // Job doesn't exist, which is fine
        }

        // Create a new job for the remaining users with the old schedule
        const oldChatIds = usersWithOldSchedule.map((u) => u.chatId);
        this.createJob(oldSchedule, oldChatIds);
        this.logger.log(
          `Updated job for schedule ${oldSchedule} with ${oldChatIds.length} users`
        );
      }

      // Update or create the job for the new schedule
      const newJobName = `fetch-listings-${schedule.replace(/\s+/g, '-')}`;
      const newChatIds = usersWithNewSchedule.map((u) => u.chatId);

      try {
        // Remove the existing job if it exists
        this.schedulerRegistry.deleteCronJob(newJobName);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        // Job doesn't exist, which is fine
      }

      // Create a new job with all users that have this schedule
      this.createJob(schedule, newChatIds);
      this.logger.log(
        `Updated job for schedule ${schedule} with ${newChatIds.length} users`
      );

      return true;
    } catch (error) {
      this.logger.error(`Error updating user schedule: ${error.message}`);
      return false;
    }
  }
}
