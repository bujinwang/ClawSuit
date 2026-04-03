import type { UserCredentialStore } from "./types.js";

export interface MLSSearchParams {
  markets?: string | string[];
  filter: "active" | "new_last_24h" | "price_reduced_last_24h" | "sold_last_90d" | "sold_last_180d";
  limit?: number;
  address?: string;
  radius_km?: number;
}

export interface MLSListing {
  mlsNumber: string;
  address: string;
  price: number;
  previousPrice?: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  daysOnMarket: number;
  status: string;
  listingDate: string;
  photos: string[];
  description: string;
  agentName: string;
  brokerage: string;
}

export class Pillar9Skill {
  private readonly baseUrl = "https://query.ampre.ca/odata";

  public constructor(
    private readonly userId: string,
    private readonly credentialStore: UserCredentialStore,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  public async search(params: MLSSearchParams): Promise<MLSListing[]> {
    const token = await this.getAccessToken();
    const filter = this.buildODataFilter(params);
    const response = await this.fetchImpl(
      `${this.baseUrl}/Property?$filter=${encodeURIComponent(filter)}&$top=${params.limit ?? 20}&$select=ListingKey,UnparsedAddress,ListPrice,BedsTotal,BathroomsTotalInteger,LivingArea,DaysOnMarket,StandardStatus,ListingContractDate`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Pillar9 request failed with ${response.status}`);
    }

    const payload = (await response.json()) as { value: Array<Record<string, unknown>> };
    return payload.value.map((listing) => this.mapListing(listing));
  }

  public buildODataFilter(params: MLSSearchParams): string {
    const filters: string[] = ["StandardStatus eq 'Active'"];

    if (params.markets) {
      const markets = Array.isArray(params.markets) ? params.markets : [params.markets];
      const cityFilter = markets.map((market) => `City eq '${market.trim()}'`).join(" or ");
      filters.push(`(${cityFilter})`);
    }

    if (params.address) {
      filters.push(`contains(UnparsedAddress,'${params.address.replace(/'/g, "''")}')`);
    }

    switch (params.filter) {
      case "new_last_24h":
        filters.push(`ListingContractDate ge ${new Date(Date.now() - 86400000).toISOString()}`);
        break;
      case "price_reduced_last_24h":
        filters.push(`PriceChangeTimestamp ge ${new Date(Date.now() - 86400000).toISOString()}`);
        break;
      case "sold_last_90d":
        filters.splice(0, 1, "StandardStatus eq 'Closed'");
        filters.push(`CloseDate ge ${new Date(Date.now() - 90 * 86400000).toISOString()}`);
        break;
      case "sold_last_180d":
        filters.splice(0, 1, "StandardStatus eq 'Closed'");
        filters.push(`CloseDate ge ${new Date(Date.now() - 180 * 86400000).toISOString()}`);
        break;
      default:
        break;
    }

    return filters.join(" and ");
  }

  private async getAccessToken(): Promise<string> {
    const creds = await this.credentialStore.get(this.userId, "pillar9");
    if (!creds?.accessToken) {
      throw new Error(`Missing pillar9 credentials for user ${this.userId}`);
    }
    return creds.accessToken;
  }

  private mapListing(raw: Record<string, unknown>): MLSListing {
    return {
      mlsNumber: String(raw.ListingKey ?? ""),
      address: String(raw.UnparsedAddress ?? ""),
      price: Number(raw.ListPrice ?? 0),
      bedrooms: Number(raw.BedsTotal ?? 0),
      bathrooms: Number(raw.BathroomsTotalInteger ?? 0),
      sqft: Number(raw.LivingArea ?? 0),
      daysOnMarket: Number(raw.DaysOnMarket ?? 0),
      status: String(raw.StandardStatus ?? ""),
      listingDate: String(raw.ListingContractDate ?? ""),
      photos: [],
      description: "",
      agentName: "",
      brokerage: ""
    };
  }
}
