import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { CarListing, AuctionReminder } from '../database/entities';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreference } from '../database/entities';
import { SchedulerService } from '../scheduler/scheduler.service';

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);

  constructor(
    @InjectBot() private bot: Telegraf,
    @InjectRepository(UserPreference)
    private userPreferenceRepository: Repository<UserPreference>,
    @InjectRepository(AuctionReminder)
    private auctionReminderRepository: Repository<AuctionReminder>,
    @InjectRepository(CarListing)
    private carListingRepository: Repository<CarListing>,
    @Inject(forwardRef(() => SchedulerService))
    private schedulerService: SchedulerService
  ) {}

  async sendNewListingNotification(
    chatId: number,
    carListing: CarListing
  ): Promise<void> {
    try {
      const message = this.formatCarListingMessage(carListing);

      if (carListing.imageUrl) {
        // Send image with caption containing car details
        await this.bot.telegram.sendPhoto(chatId, carListing.imageUrl, {
          caption: message,
          parse_mode: 'HTML',
        });
      } else {
        // Fallback to text-only message if no image is available
        await this.bot.telegram.sendMessage(chatId, message, {
          parse_mode: 'HTML',
        });
      }
    } catch (error) {
      console.error(`Failed to send notification to chat ${chatId}:`, error);
    }
  }

  /**
   * Sends notifications for multiple car listings to a user
   */
  async sendBatchNotifications(
    chatId: number,
    carListings: CarListing[]
  ): Promise<void> {
    if (carListings.length === 0) {
      return;
    }

    try {
      // Send a summary message first
      const summaryMessage = `🚗 Found ${carListings.length} new car listings since your last update!`;
      await this.bot.telegram.sendMessage(chatId, summaryMessage);

      // Send each listing
      for (const listing of carListings) {
        await this.sendNewListingNotification(chatId, listing);
      }

      // Update the user's last notification time
      await this.updateLastNotificationTime(chatId);
    } catch (error) {
      console.error(
        `Failed to send batch notifications to chat ${chatId}:`,
        error
      );
    }
  }

  /**
   * Updates the user's lastNotificationTime to the current time
   */
  private async updateLastNotificationTime(chatId: number): Promise<void> {
    try {
      const user = await this.userPreferenceRepository.findOne({
        where: { chatId },
      });

      if (user) {
        user.lastNotificationTime = new Date();
        await this.userPreferenceRepository.save(user);
      }
    } catch (error) {
      console.error(
        `Failed to update last notification time for chat ${chatId}:`,
        error
      );
    }
  }

  /**
   * Sends notifications for new car listings to users based on their last notification time
   */
  async sendNewListingsToUsers(newListings: CarListing[]): Promise<void> {
    if (newListings.length === 0) {
      return;
    }

    const activeUsers = await this.userPreferenceRepository.find({
      where: { isActive: true },
    });

    for (const user of activeUsers) {
      // Filter listings based on user's last notification time
      const userNewListings = user.lastNotificationTime
        ? newListings.filter(
            (listing) =>
              !user.lastNotificationTime ||
              listing.createdAt > user.lastNotificationTime
          )
        : newListings;

      if (userNewListings.length > 0) {
        await this.sendBatchNotifications(user.chatId, userNewListings);
      }
    }
  }

  /**
   * Triggers a manual update for a specific user
   * @param chatId The chat ID of the user
   * @returns A message indicating the result of the update
   */
  async triggerManualUpdate(chatId: number): Promise<string> {
    try {
      const result = await this.schedulerService.executeManualUpdate(chatId);

      if (!result.success) {
        return 'Failed to check for new listings. Please try again later.';
      }

      if (result.count === 0) {
        return 'No new car listings found since your last update.';
      }

      return `Manual update completed. You will receive notifications for ${result.count} new listings.`;
    } catch (error) {
      console.error(
        `Error triggering manual update for chat ${chatId}:`,
        error
      );
      return 'An error occurred while checking for new listings. Please try again later.';
    }
  }

  /**
   * Sends an auction reminder to a user
   * @param chatId The chat ID of the user
   * @param reminder The auction reminder
   * @param listing The car listing
   */
  async sendAuctionReminder(
    chatId: number,
    reminder: AuctionReminder,
    listing: CarListing
  ): Promise<void> {
    try {
      const auctionDate = new Date(listing.auctionDate).toLocaleString();
      const timeUntilAuction = this.formatTimeUntilAuction(listing.auctionDate);

      const message = `
🔔 <b>Auction Reminder</b>

Your auction for the following car is coming up ${timeUntilAuction}:

<b>Make:</b> ${listing.make || ''}
<b>Model:</b> ${listing.model}
<b>Year:</b> ${listing.year}
<b>Price:</b> ${new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(listing.price)}
<b>Auction Date:</b> ${auctionDate}

${listing.lotUrl ? `<a href="${listing.lotUrl}">View on Copart</a>` : ''}
`;

      if (listing.imageUrl) {
        // Send image with caption
        await this.bot.telegram.sendPhoto(chatId, listing.imageUrl, {
          caption: message,
          parse_mode: 'HTML',
        });
      } else {
        // Fallback to text-only message
        await this.bot.telegram.sendMessage(chatId, message, {
          parse_mode: 'HTML',
        });
      }

      this.logger.log(
        `Sent auction reminder for listing ${listing.listingId} to user ${chatId}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to send auction reminder to chat ${chatId}:`,
        error
      );
    }
  }

  /**
   * Formats the time until an auction in a human-readable format
   * @param auctionDate The date of the auction
   * @returns A string representing the time until the auction
   */
  private formatTimeUntilAuction(auctionDate: Date): string {
    const now = new Date();
    const auction = new Date(auctionDate);
    const diffMs = auction.getTime() - now.getTime();

    // Convert to minutes, hours, and days
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 60) {
      return `in ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
    } else if (diffHours < 24) {
      return `in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
    } else {
      return `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    }
  }

  /**
   * Formats a car listing into a message for Telegram
   * @param carListing The car listing to format
   * @returns A formatted message string
   */
  formatCarListingMessage(carListing: CarListing): string {
    const formattedPrice = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(carListing.price);

    const auctionDate = carListing.auctionDate
      ? new Date(carListing.auctionDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'Not specified';

    // Format odometer reading if available
    let odometerInfo = '';
    if (carListing.odometer) {
      odometerInfo = `${carListing.odometer.toLocaleString()} ${
        carListing.odometerType || 'miles'
      }`;
    }

    let message = `
<b>🚗 New Car Listing</b>

`;

    // Add make if available
    if (carListing.make) {
      message += `<b>Make:</b> ${carListing.make}\n`;
    }

    message += `<b>Model:</b> ${carListing.model}
<b>Year:</b> ${carListing.year}
<b>Price:</b> ${formattedPrice}
<b>Auction Date:</b> ${auctionDate}
`;

    // Add additional details if available
    if (carListing.color) {
      message += `<b>Color:</b> ${carListing.color}\n`;
    }

    if (carListing.damageDescription) {
      message += `<b>Damage:</b> ${carListing.damageDescription}\n`;
    }

    if (carListing.lotDescription) {
      message += `<b>Description:</b> ${carListing.lotDescription}\n`;
    }

    if (carListing.lotCondition) {
      message += `<b>Condition:</b> ${carListing.lotCondition}\n`;
    }

    if (odometerInfo) {
      message += `<b>Odometer:</b> ${odometerInfo}\n`;
    }

    if (carListing.driveType) {
      message += `<b>Drive Type:</b> ${carListing.driveType}\n`;
    }

    if (carListing.transmissionType) {
      message += `<b>Transmission:</b> ${carListing.transmissionType}\n`;
    }

    if (carListing.fuelType) {
      message += `<b>Fuel Type:</b> ${carListing.fuelType}\n`;
    }

    if (carListing.engine) {
      let engineInfo = carListing.engine;
      if (carListing.cylinders) {
        engineInfo += ` (${carListing.cylinders} cylinders)`;
      }
      message += `<b>Engine:</b> ${engineInfo}\n`;
    } else if (carListing.cylinders) {
      message += `<b>Cylinders:</b> ${carListing.cylinders}\n`;
    }

    if (carListing.vin) {
      message += `<b>VIN:</b> ${carListing.vin}\n`;
    }

    if (carListing.yardName) {
      message += `<b>Yard:</b> ${carListing.yardName}\n`;
    }

    // Title information
    if (
      carListing.titleState ||
      carListing.titleType ||
      carListing.titleDescription
    ) {
      let titleInfo = '';
      if (carListing.titleState) titleInfo += carListing.titleState + ' ';
      if (carListing.titleType) titleInfo += carListing.titleType + ' ';
      if (carListing.titleDescription)
        titleInfo += '- ' + carListing.titleDescription;
      message += `<b>Title:</b> ${titleInfo.trim()}\n`;
    }

    // Sale status
    if (carListing.saleStatus) {
      message += `<b>Sale Status:</b> ${carListing.saleStatus}\n`;
    }

    // Bid status
    if (carListing.bidStatus) {
      message += `<b>Bid Status:</b> ${carListing.bidStatus}\n`;
    }

    if (carListing.lotUrl) {
      message += `\n<a href="${carListing.lotUrl}">View on Copart</a>`;
    }

    return message;
  }
}
