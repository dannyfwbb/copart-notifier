/**
 * Interfaces for Copart API
 */

// Request interfaces
export interface CopartApiRequest {
  query: string[];
  filter: CopartApiFilter;
  sort: string[];
  page: number;
  size: number;
  start: number;
  watchListOnly: boolean;
  freeFormSearch: boolean;
  hideImages: boolean;
  defaultSort: boolean;
  specificRowProvided: boolean;
  displayName: string;
  searchName: string;
  backUrl: string;
  includeTagByField: Record<string, string>;
  rawParams: Record<string, unknown>; // Changed from any to unknown for type safety
}

export interface CopartApiFilter {
  MAKE?: string[];
  MODL?: string[];
  YEAR?: string[];
  DRIV?: string[];
  ODM?: string[];
  [key: string]: string[] | undefined;
}

// Response interfaces
export interface CopartApiResponse {
  returnCode: number;
  returnCodeDesc: string;
  data: CopartApiResponseData;
}

export interface CopartApiResponseData {
  query: CopartApiRequest;
  results: CopartApiResults;
}

// Facet field interfaces for search results
export interface FacetCount {
  count: number;
  query: string;
  sortKey?: string;
  sequenceNumber: number;
  uri?: string;
  synonyms?: string[];
  ignoreCount: boolean;
  displayName: string;
  columnName?: string;
  quickPickGroupName?: string;
}

export interface FacetField {
  quickPickCode: string;
  facetCounts: FacetCount[];
  sequenceNumber: number;
  includeTag: string;
  quickPickCategoryUri: string;
  hideFacet: boolean;
  min: number | null;
  max: number | null;
  statsField: boolean;
  displayName: string;
}

export interface CopartApiResults {
  totalElements: number;
  content: CopartApiLot[];
  facetFields?: FacetField[]; // Replaced any[] with proper type
  spellCheckList?: unknown; // Replaced any with unknown since structure is not fully known
  suggestions?: unknown; // Replaced any with unknown since structure is not fully known
  realTime?: boolean;
}

export interface CopartApiLot {
  ln: number; // Lot number
  mkn: string; // Make name
  lmg: string; // Lot model group
  lm: string; // Lot model
  mmod: string; // Manufacturer model
  lcy: number; // Lot year
  fv: string; // VIN (masked)
  la: number; // Lot amount
  hb: number; // High bid
  orr: number; // Odometer reading
  ord: string; // Odometer reading type
  egn: string; // Engine
  cy: string; // Cylinders
  ld: string; // Lot description
  yn: string; // Yard name
  ad: number; // Auction date (timestamp)
  at: string; // Auction time
  tims: string; // Thumbnail image URL
  dd: string; // Damage description
  clr: string; // Color
  drv: string; // Drive type
  tmtp: string; // Transmission type
  ft: string; // Fuel type
  lcd: string; // Lot condition description
  ts: string; // Title state
  stt: string; // Sale title type
  td: string; // Title description
  tgc: string; // Title group code
  tgd: string; // Title group description
  lotUrl?: string; // URL to lot details (constructed)
  dynamicLotDetails?: {
    currentBid: number; // Current bid amount
    bidStatus: string; // Bid status
    saleStatus: string; // Sale status
  };
  // Allow for additional properties from the API that aren't explicitly typed
  [key: string]: unknown; // Changed from any to unknown for type safety
}
