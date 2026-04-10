import dotenv from 'dotenv';
import { DataShiftConfig } from '../data-shift/analyze';
import { EngineConfig } from '../engine/engine';
import { AssociationLabelService } from '../hubspot/association-labels';
import { HubspotCreds } from '../hubspot/api';
import { MultiMpacCreds } from '../marketplace/api/api';
import { MpacConfig } from '../marketplace/marketplace';
import { HubspotContactConfig } from '../model/contact';
import { HubspotDealConfig } from '../model/deal';
import { RunLoopConfig } from '../util/runner';

dotenv.config();

export function keepDataSetConfigFromENV() {
  return optional('KEEP_DATA_SETS');
}

export function deleteBlockingDeals() {
  return optional('DELETE_BLOCKING_DEALS')?.toLowerCase() === 'yes';
}

export function hubspotCredsFromENV(): HubspotCreds {
  return {
    accessToken: required('HUBSPOT_ACCESS_TOKEN'),
    basePath: optional('HUBSPOT_BASE_URL'),
  };
}

export type AssociationLabelEnvConfig = {
  dealContactTechnical?: number;
  dealContactBilling?: number;
  dealContactPartner?: number;
  dealCompanyCustomer?: number;
  dealCompanyPartner?: number;
};

export function associationLabelsFromENV(): AssociationLabelEnvConfig {
  const parse = (key: string) => {
    const v = optional(key);
    return v ? +v : undefined;
  };
  return {
    dealContactTechnical: parse('HUBSPOT_ASSOC_DEAL_CONTACT_TECHNICAL'),
    dealContactBilling: parse('HUBSPOT_ASSOC_DEAL_CONTACT_BILLING'),
    dealContactPartner: parse('HUBSPOT_ASSOC_DEAL_CONTACT_PARTNER'),
    dealCompanyCustomer: parse('HUBSPOT_ASSOC_DEAL_COMPANY_CUSTOMER'),
    dealCompanyPartner: parse('HUBSPOT_ASSOC_DEAL_COMPANY_PARTNER'),
  };
}

export function hubspotSettingsFromENV() {
  const typeMappings = optional('HUBSPOT_ASSOCIATION_TYPE_MAPPINGS');
  return typeMappings ? new Map(typeMappings.split(',').map((kv) => kv.split(':') as [string, string])) : undefined;
}

export function mpacCredsFromENV(): MultiMpacCreds {
  return {
    user: required('MPAC_USER'),
    apiKey: required('MPAC_API_KEY'),
    sellerIds: required('MPAC_SELLER_ID').split(','),
  };
}

export function dataShiftConfigFromENV(): DataShiftConfig | undefined {
  const threshold = optional('LATE_TRANSACTION_THRESHOLD_DAYS');
  if (!threshold) return undefined;
  return {
    lateTransactionThresholdDays: +threshold,
  };
}

export function slackConfigFromENV() {
  return {
    apiToken: optional('SLACK_API_TOKEN'),
    errorChannelId: optional('SLACK_ERROR_CHANNEL_ID'),
  };
}

export function runLoopConfigFromENV(): RunLoopConfig {
  return {
    runInterval: required('RUN_INTERVAL'),
    retryInterval: required('RETRY_INTERVAL'),
    retryTimes: +required('RETRY_TIMES'),
  };
}

export function hubspotDealConfigFromENV(): HubspotDealConfig {
  return {
    accountId: optional('HUBSPOT_ACCOUNT_ID'),
    pipeline: {
      mpac: required('HUBSPOT_PIPELINE_MPAC'),
    },
    dealstage: {
      eval: required('HUBSPOT_DEALSTAGE_EVAL'),
      closedWon: required('HUBSPOT_DEALSTAGE_CLOSED_WON'),
      closedLost: required('HUBSPOT_DEALSTAGE_CLOSED_LOST'),
    },
    attrs: {
      app: optional('HUBSPOT_DEAL_APP_ATTR'),
      origin: optional('HUBSPOT_DEAL_ORIGIN_ATTR'),
      country: optional('HUBSPOT_DEAL_COUNTRY_ATTR'),
      deployment: optional('HUBSPOT_DEAL_DEPLOYMENT_ATTR'),
      saleType: optional('HUBSPOT_DEAL_SALE_TYPE_ATTR'),
      appEntitlementId: required('HUBSPOT_DEAL_APPENTITLEMENTID_ATTR'),
      appEntitlementNumber: required('HUBSPOT_DEAL_APPENTITLEMENTNUMBER_ATTR'),
      addonLicenseId: required('HUBSPOT_DEAL_ADDONLICENESID_ATTR'),
      transactionId: required('HUBSPOT_DEAL_TRANSACTIONID_ATTR'),
      transactionLineItemId: required('HUBSPOT_DEAL_TRANSACTIONLINEITEMID_ATTR'),
      licenseTier: optional('HUBSPOT_DEAL_LICENSE_TIER_ATTR'),
      relatedProducts: optional('HUBSPOT_DEAL_RELATED_PRODUCTS_ATTR'),
      associatedPartner: optional('HUBSPOT_DEAL_ASSOCIATED_PARTNER'),
      duplicateOf: optional('HUBSPOT_DEAL_DUPLICATEOF_ATTR'),
      maintenanceEndDate: optional('HUBSPOT_DEAL_MAINTENANCE_END_DATE_ATTR'),
    },
    managedFields: new Set(optional('HUBSPOT_MANAGED_DEAL_FIELDS')?.split(/\s*,\s*/g) ?? []),
  };
}

export const hubspotAccountIdFromEnv = optional('HUBSPOT_ACCOUNT_ID');

export function hubspotContactConfigFromENV(): HubspotContactConfig {
  return {
    attrs: {
      deployment: optional('HUBSPOT_CONTACT_DEPLOYMENT_ATTR'),
      licenseTier: optional('HUBSPOT_CONTACT_LICENSE_TIER_ATTR'),
      products: optional('HUBSPOT_CONTACT_PRODUCTS_ATTR'),
      lastMpacEvent: optional('HUBSPOT_CONTACT_LAST_MPAC_EVENT_ATTR'),
      contactType: optional('HUBSPOT_CONTACT_CONTACT_TYPE_ATTR'),
      region: optional('HUBSPOT_CONTACT_REGION_ATTR'),
      relatedProducts: optional('HUBSPOT_CONTACT_RELATED_PRODUCTS_ATTR'),
      lastAssociatedPartner: optional('HUBSPOT_CONTACT_LAST_ASSOCIATED_PARTNER'),
    },
    managedFields: new Set(optional('HUBSPOT_MANAGED_CONTACT_FIELDS')?.split(/\s*,\s*/g) ?? []),
  };
}

export function mpacConfigFromENV(): MpacConfig {
  return {
    ignoredEmails: new Set((optional('IGNORED_EMAILS')?.split(',') ?? []).map((e) => e.toLowerCase())),
    emailMappings: optional('EMAIL_MAPPINGS')?.split(',').reduce((p: Record<string, string>, c: string) => {
      let mapping = c.split('=')
      p[mapping[0]] = mapping[1]
      return p
    }, {})
  };
}

export function engineConfigFromENV(): EngineConfig {
  const partnerPipelineId = optional('HUBSPOT_PIPELINE_PARTNER');
  return {
    partnerDomains: new Set(optional('PARTNER_DOMAINS')?.split(/\s*,\s*/g) ?? []),
    appToPlatform: Object.fromEntries<string>(
      required('ADDONKEY_PLATFORMS')
        .split(',')
        .map((kv) => kv.split('=') as [string, string])
    ),
    archivedApps: new Set(optional('IGNORED_APPS')?.split(',') ?? []),
    dealProperties: {
      dealOrigin: optional('DEAL_ORIGIN'),
      dealRelatedProducts: optional('DEAL_RELATED_PRODUCTS'),
      dealDealName: required('DEAL_DEALNAME'),
    },
    partnerPipeline: partnerPipelineId ? {
      pipelineId: partnerPipelineId,
      partnerStages: new Set(optional('HUBSPOT_DEALSTAGES_EAZYBI_PARTNER')?.split(',') ?? []),
      certifiedStages: new Set(optional('HUBSPOT_DEALSTAGE_EAZYBI_CERTIFIED')?.split(',') ?? []),
    } : undefined,
    associationLabels: new AssociationLabelService(associationLabelsFromENV()),
  };
}

export interface IncrementalSyncConfig {
  fullSyncIntervalDays: number;
  incrementalOverlapDays: number;
  maxRetryCount: number;
}

export function incrementalSyncConfigFromENV(): IncrementalSyncConfig {
  return {
    fullSyncIntervalDays: +(optional('FULL_SYNC_INTERVAL_DAYS') ?? '7'),
    incrementalOverlapDays: +(optional('INCREMENTAL_OVERLAP_DAYS') ?? '1'),
    maxRetryCount: +(optional('UPLOAD_MAX_RETRY_COUNT') ?? '3'),
  };
}

function required(key: string) {
  const value = process.env[key];
  if (!value) {
    console.error(`ENV key ${key} is required`);
    process.exit(1);
  }
  return value;
}

function optional(key: string) {
  return process.env[key];
}
