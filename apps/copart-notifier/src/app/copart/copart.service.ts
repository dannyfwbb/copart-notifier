import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CarListing } from '../database/entities';
import axios from 'axios';
import {
  CopartApiFilter,
  CopartApiLot,
  CopartApiRequest,
  CopartApiResponse,
} from './interfaces/copart-api.interfaces';

@Injectable()
export class CopartService implements OnModuleInit {
  private readonly logger = new Logger(CopartService.name);
  private readonly baseUrl = 'https://www.copart.com';
  private readonly apiUrl = `${this.baseUrl}/public/lots/vehicle-finder-search-results`;
  private initialFetchComplete = false;

  constructor(
    @InjectRepository(CarListing)
    private carListingRepository: Repository<CarListing>
  ) {}

  async onModuleInit() {
    try {
      await this.fetchInitialListings();
    } catch (error) {
      this.logger.error(
        'Failed to perform initial fetch, but continuing application startup',
        error.message
      );
    }
  }

  /**
   * Fetches all car listings on application startup,
   * saves them to the database, and outputs statistics.
   */
  async fetchInitialListings(): Promise<void> {
    if (this.initialFetchComplete) {
      this.logger.log('Initial fetch already completed, skipping...');
      return;
    }

    this.logger.log(
      'Performing initial fetch of car listings from Copart API...'
    );
    const startTime = Date.now();

    try {
      // First try to fetch real data from the API
      const response = await this.fetchFromCopartApi(100);

      // Process and save the listings
      const listings = response.data.results.content;
      const savedListings = await this.processAndSaveListings(listings);

      // Calculate and log statistics
      const endTime = Date.now();
      const processingTime = (endTime - startTime) / 1000;
      const totalListings = await this.carListingRepository.count();

      // Output fancy stats
      this.logInitialFetchStats(
        listings,
        savedListings,
        totalListings,
        processingTime
      );

      this.initialFetchComplete = true;
      this.logger.log('Initial fetch completed with real data from API');
    } catch (error) {
      this.logger.warn('API call failed', error.message);
    }
  }

  /**
   * Logs fancy statistics about the initial fetch
   */
  private logInitialFetchStats(
    fetchedListings: CopartApiLot[],
    savedListings: CarListing[],
    totalListings: number,
    processingTime: number
  ): void {
    // Create a fancy console output with box drawing characters
    const stats = [
      '┌─────────────────────────────────────────────────┐',
      '│             COPART INITIAL FETCH STATS          │',
      '├─────────────────────────────────────────────────┤',
      `│ Total Listings Fetched: ${fetchedListings.length
        .toString()
        .padStart(21, ' ')} │`,
      `│ New Listings Saved:     ${savedListings.length
        .toString()
        .padStart(21, ' ')} │`,
      `│ Total Listings in DB:   ${totalListings
        .toString()
        .padStart(21, ' ')} │`,
      `│ Processing Time:        ${processingTime.toFixed(2)}s${' '.repeat(
        19 - processingTime.toFixed(2).length
      )} │`,
      '├─────────────────────────────────────────────────┤',
    ];

    // Add price statistics
    if (fetchedListings.length > 0) {
      const prices = fetchedListings
        .map((l) => l.hb || l.la || 0)
        .filter((p) => p > 0);
      const avgPrice =
        prices.reduce((sum, price) => sum + price, 0) / prices.length;
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);

      stats.push(
        '│ PRICE STATISTICS                               │',
        `│ Average Price:         $${avgPrice.toFixed(2).padStart(19, ' ')} │`,
        `│ Minimum Price:         $${minPrice.toFixed(2).padStart(19, ' ')} │`,
        `│ Maximum Price:         $${maxPrice.toFixed(2).padStart(19, ' ')} │`,
        '├─────────────────────────────────────────────────┤'
      );
    }

    // Add model statistics
    const modelCounts = new Map<string, number>();
    fetchedListings.forEach((listing) => {
      const model = listing.lm || 'Unknown';
      modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
    });

    stats.push('│ TOP MODELS                                   │');

    // Get top 3 models by count
    const topModels = Array.from(modelCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    topModels.forEach(([model, count]) => {
      const displayText = `${model} (${count})`;
      stats.push(`│ ${displayText.padEnd(43, ' ')} │`);
    });

    stats.push('└─────────────────────────────────────────────────┘');

    // Log the fancy stats
    stats.forEach((line) => this.logger.log(line));
  }

  async fetchNewListings(): Promise<CarListing[]> {
    try {
      this.logger.log('Fetching new car listings from Copart API');

      // First try to fetch real data
      const response = await this.fetchFromCopartApi();

      // Process and save new listings
      const newListings = await this.processAndSaveListings(
        response.data.results.content
      );

      this.logger.log(`Found ${newListings.length} new car listings from API`);
      return newListings;
    } catch (error) {
      // API call failed
      this.logger.warn('API call failed', error.message);
    }
  }

  /**
   * Fetches car listings from the Copart API
   * @param size Number of listings to fetch
   * @returns API response with car listings
   * @throws Error if the API call fails or returns an invalid response
   */
  private async fetchFromCopartApi(size = 100): Promise<CopartApiResponse> {
    try {
      this.logger.log('Getting initial cookies from Copart homepage...');

      // Create a custom axios instance with specific configurations
      const axiosInstance = axios.create({
        // Don't follow redirects automatically
        maxRedirects: 0,
        // Don't throw errors on non-2xx responses
        validateStatus: function (status) {
          return status >= 200 && status < 600; // Accept all status codes
        },
        timeout: 15000, // 15 seconds timeout
      });

      // First, get the homepage to obtain cookies
      const homepageResponse = await axiosInstance.get(
        'https://www.copart.com',
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        }
      );

      // Extract cookies from the response
      const cookies = homepageResponse.headers['set-cookie'];
      if (cookies) {
        this.logger.log('Cookies obtained successfully');
      } else {
        this.logger.warn('No cookies received from homepage');
      }

      // Construct cookie string from the array of cookies
      const cookieString = cookies
        ? cookies.map((cookie) => cookie.split(';')[0]).join('; ')
        : '';

      // Add consent cookies
      const consentCookies =
        'OptanonAlertBoxClosed=2025-04-21T00:06:30.402Z; OptanonConsent=isGpcEnabled=0&datestamp=Sun+Apr+21+2025+02:06:30+GMT+0200+(Central+European+Summer+Time)&version=202309.1.0&isIABGlobal=false&hosts=&consentId=4e059a0c-8fe4-4a93-9d0f-8f7a7383b6c0&interactionCount=1&landingPath=NotLandingPage&groups=C0001:1,C0002:1,C0003:1,C0004:1&geolocation=PL;02&AwaitingReconsent=false';

      // Combine all cookies
      const fullCookieString = cookieString
        ? `${cookieString}; ${consentCookies}`
        : consentCookies;

      this.logger.log('Sending request to Copart API with cookies...');

      // Create the request body
      const requestBody: CopartApiRequest = {
        query: ['*'],
        filter: this.createFilter(),
        sort: [
          'salelight_priority asc',
          'auction_date_type desc',
          'auction_date_utc asc',
        ],
        page: 0,
        size, // Fetch up to the specified number of listings at a time
        start: 0,
        watchListOnly: false,
        freeFormSearch: false,
        hideImages: false,
        defaultSort: false,
        specificRowProvided: false,
        displayName: '',
        searchName: '',
        backUrl: '',
        includeTagByField: {
          MAKE: '{!tag=MAKE}',
          MODL: '{!tag=MMOD}',
          YEAR: '{!tag=YEAR}',
          DRIV: '{!tag=DRIV}',
          ODM: '{!tag=ODM} ',
        },
        rawParams: {},
      };

      // Make the API request with cookies
      const response = await axiosInstance.post<CopartApiResponse>(
        this.apiUrl,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            Origin: 'https://www.copart.com',
            Referer: 'https://www.copart.com/vehicleFinder/',
            Cookie: fullCookieString,
            'X-Requested-With': 'XMLHttpRequest',
          },
        }
      );

      // Check if we got a redirect
      if (response.status >= 300 && response.status < 400) {
        const errorMsg = `API returned a redirect to: ${response.headers.location}`;
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Check if the response is successful
      if (response.status !== 200) {
        const errorMsg = `API returned status code: ${response.status}`;
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Check if the response has the expected structure
      if (
        !response.data ||
        !response.data.data ||
        !response.data.data.results
      ) {
        const errorMsg = 'Unexpected API response structure';
        this.logger.warn(errorMsg, response.data);
        throw new Error(errorMsg);
      }

      // Check if the API returned a success code
      if (
        response.data.returnCode !== 1 ||
        response.data.returnCodeDesc !== 'Success'
      ) {
        const errorMsg = `API returned non-success code: ${response.data.returnCode} - ${response.data.returnCodeDesc}`;
        this.logger.warn(errorMsg);
        throw new Error(errorMsg);
      }

      this.logger.log(
        `Successfully fetched ${response.data.data.results.content.length} car listings from API`
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Error fetching from Copart API: ${error.message}`);
      throw error; // Re-throw the error to be handled by the calling method
    }
  }

  private createFilter(): CopartApiFilter {
    // You can customize this filter based on your requirements
    return {
      MAKE: ['lot_make_desc:"AUDI"'],
      MODL: ['manufacturer_model_desc:"A4"'],
      YEAR: ['lot_year:[2017 TO 2017]'],
      DRIV: ['drive:"All wheel drive"'],
      ODM: ['odometer_reading_received:[0 TO 120000]'],
    };
  }

  private async processAndSaveListings(
    apiLots: CopartApiLot[]
  ): Promise<CarListing[]> {
    const newListings: CarListing[] = [];

    for (const lot of apiLots) {
      // Convert API lot to our CarListing format
      const listingId = lot.ln.toString();
      const model = lot.lm || '';
      const year = lot.lcy || 0;

      // Skip listings with missing required data
      if (!model || !year || !listingId) {
        continue;
      }

      // Check if listing already exists in database
      const existingListing = await this.carListingRepository.findOne({
        where: { listingId },
      });

      if (!existingListing) {
        // Determine price (use high bid or lot amount)
        const price =
          lot.dynamicLotDetails?.currentBid || lot.hb || lot.la || 0;

        // Convert auction date from timestamp to Date
        const auctionDate = lot.ad ? new Date(lot.ad) : new Date();

        // Get image URL
        const imageUrl = lot.tims || null;

        // Construct lot URL
        const lotUrl = this.constructLotUrl(lot);

        // Extract additional fields
        const damageDescription = lot.dd || null;
        const color = lot.clr || null;
        const driveType = lot.drv || null;
        const transmissionType = lot.tmtp || null;
        const fuelType = lot.ft || null;
        const odometer = lot.orr || null;
        const odometerType = lot.ord || null;
        const engine = lot.egn || null;
        const cylinders = lot.cy || null;

        // Extract additional detailed car information
        const vin = lot.fv || null;
        const make = lot.mkn || null;
        const titleState = lot.ts || null;
        const titleType = lot.stt || null;
        const titleDescription = lot.td || null;
        const lotDescription = lot.ld || null;
        const yardName = lot.yn || null;
        const lotCondition = lot.lcd || null;
        const saleStatus = lot.dynamicLotDetails?.saleStatus || null;
        const bidStatus = lot.dynamicLotDetails?.bidStatus || null;

        // Create and save new listing
        const newListing = this.carListingRepository.create({
          listingId,
          model,
          year,
          price,
          auctionDate,
          imageUrl,
          lotUrl,
          damageDescription,
          color,
          driveType,
          transmissionType,
          fuelType,
          odometer,
          odometerType,
          engine,
          cylinders,
          // Additional detailed car information
          vin,
          make,
          titleState,
          titleType,
          titleDescription,
          lotDescription,
          yardName,
          lotCondition,
          saleStatus,
          bidStatus,
        });

        await this.carListingRepository.save(newListing);
        newListings.push(newListing);
      }
    }

    return newListings;
  }

  private constructLotUrl(lot: CopartApiLot): string {
    // Construct a URL to the lot details page
    // Format: https://www.copart.com/lot/[lot_number]/[optional-slug]
    const lotNumber = lot.ln.toString();

    // If lot has a ldu (lot details URL) property, use it
    if (lot.ldu) {
      return `${this.baseUrl}/lot/${lotNumber}/${lot.ldu}`;
    }

    // Otherwise, just use the lot number
    return `${this.baseUrl}/lot/${lotNumber}`;
  }
}
