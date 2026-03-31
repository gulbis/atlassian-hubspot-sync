import { FullEntity } from "../hubspot/interfaces";
import { RawAttribution, RawLicense, RawTransaction } from "../marketplace/raw";

export interface RawDataSet {
  tlds: string[];
  licensesWithDataInsights: RawLicense[];
  licensesWithoutDataInsights: RawLicense[];
  transactions: RawTransaction[];
  rawAttributions: RawAttribution[];
  freeDomains: string[];
  rawDeals: FullEntity[];
  rawCompanies: FullEntity[];
  rawContacts: FullEntity[];
}
