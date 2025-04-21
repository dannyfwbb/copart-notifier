/**
 * Test script for Copart API integration
 *
 * This script can be run directly with Node.js to test the Copart API integration
 * without running the entire application.
 *
 * Usage:
 * node apps/copart-notifier/src/app/copart/test-copart-api.js
 */

const axios = require('axios');
const https = require('https');

async function testCopartApi() {
  console.log('Testing Copart API integration...');

  // Create a custom axios instance with specific configurations
  const axiosInstance = axios.create({
    // Create a custom HTTPS agent that doesn't validate certificates
    // This can help with some SSL/TLS issues
    httpsAgent: new https.Agent({
      rejectUnauthorized: false
    }),
    // Don't follow redirects automatically
    maxRedirects: 0,
    // Don't throw errors on non-2xx responses
    validateStatus: function (status) {
      return status >= 200 && status < 600; // Accept all status codes
    },
    timeout: 15000 // 15 seconds timeout
  });

  // First, get the homepage to obtain cookies
  console.log('Getting initial cookies from homepage...');
  try {
    const homepageResponse = await axiosInstance.get('https://www.copart.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    // Extract cookies from the response
    const cookies = homepageResponse.headers['set-cookie'];
    if (cookies) {
      console.log('Cookies obtained successfully');
    } else {
      console.log('No cookies received from homepage');
    }

    // Construct cookie string from the array of cookies
    const cookieString = cookies ? cookies.map(cookie => cookie.split(';')[0]).join('; ') : '';
    
    // Add consent cookies
    const consentCookies = 'OptanonAlertBoxClosed=2025-04-21T00:06:30.402Z; OptanonConsent=isGpcEnabled=0&datestamp=Sun+Apr+21+2025+02:06:30+GMT+0200+(Central+European+Summer+Time)&version=202309.1.0&isIABGlobal=false&hosts=&consentId=4e059a0c-8fe4-4a93-9d0f-8f7a7383b6c0&interactionCount=1&landingPath=NotLandingPage&groups=C0001:1,C0002:1,C0003:1,C0004:1&geolocation=PL;02&AwaitingReconsent=false';
    
    // Combine all cookies
    const fullCookieString = cookieString ? `${cookieString}; ${consentCookies}` : consentCookies;

    // Now make the API request with the cookies
    console.log('Sending request to Copart API with cookies...');

    const baseUrl = 'https://www.copart.com';
    const apiUrl = `${baseUrl}/public/lots/vehicle-finder-search-results`;

    // Create the request body - simplified to reduce potential errors
    const requestBody = {
      query: ['*'],
      filter: {
        MAKE: ['lot_make_desc:"AUDI"'],
      },
      sort: [
        'auction_date_type desc',
        'auction_date_utc asc',
      ],
      page: 0,
      size: 20,
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
      },
      rawParams: {},
    };

    // Make the API request with cookies
    const response = await axiosInstance.post(apiUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://www.copart.com',
        'Referer': 'https://www.copart.com/vehicleFinder/',
        'Cookie': fullCookieString,
        'X-Requested-With': 'XMLHttpRequest',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
      }
    });

    // Check if we got a redirect
    if (response.status >= 300 && response.status < 400) {
      console.log(`Received redirect to: ${response.headers.location}`);
      console.error('API returned a redirect. This might indicate authentication issues.');
      return;
    }

    // Check if the response is successful
    if (response.status !== 200) {
      console.error(`API returned status code: ${response.status}`);
      console.error('Response data:', response.data);
      return;
    }

    // Check if the response has the expected structure
    if (!response.data || !response.data.data || !response.data.data.results) {
      console.error('Unexpected API response structure:', response.data);
      return;
    }

    if (
      response.data.returnCode !== 1 ||
      response.data.returnCodeDesc !== 'Success'
    ) {
      console.error(`API returned error: ${response.data.returnCodeDesc}`);
      return;
    }

    const listings = response.data.data.results.content;
    console.log(`Successfully fetched ${listings.length} car listings`);

    // Display the first 3 listings
    console.log('\nSample listings:');
    listings.slice(0, 3).forEach((lot, index) => {
      console.log(`\nListing ${index + 1}:`);
      console.log(`- Lot Number: ${lot.ln}`);
      console.log(`- Model: ${lot.lm || 'N/A'}`);
      console.log(`- Year: ${lot.lcy || 'N/A'}`);
      console.log(`- Price: $${lot.hb || lot.la || 0}`);
      console.log(`- Auction Date: ${lot.ad ? new Date(lot.ad).toLocaleDateString() : 'N/A'}`);
      console.log(`- Image URL: ${lot.tims || 'N/A'}`);
    });

    console.log('\nAPI integration test completed successfully!');
  } catch (error) {
    console.error('Error testing Copart API:', error.message);
    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      } else if (error.request) {
        console.error('No response received:', error.request);
      }
    }
  }
}

// Run the test
testCopartApi();
