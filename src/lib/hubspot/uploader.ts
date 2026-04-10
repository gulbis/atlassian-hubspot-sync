import { ConsoleLogger } from '../log/console';
import { FailedUploadRecord } from '../data/sync-state';
import HubspotAPI from "./api";
import { Entity } from './entity';
import { Hubspot } from './hubspot';
import {EntityKind} from './interfaces';
import { EntityManager } from "./manager";
import {DealManager} from '../model/deal'
import {deleteBlockingDeals} from '../config/env'

export interface EntityUploadResult {
  created: number;
  updated: number;
  failed: FailedUploadRecord[];
  unchanged: number;
}

export interface UploadResult {
  contacts: EntityUploadResult;
  deals: EntityUploadResult;
  companies: EntityUploadResult;
  associations: { created: number; deleted: number };
}

function emptyEntityResult(): EntityUploadResult {
  return { created: 0, updated: 0, failed: [], unchanged: 0 };
}

export class HubspotUploader {

  #console?: ConsoleLogger;
  api;
  constructor(console?: ConsoleLogger) {
    this.#console = console;
    this.api = new HubspotAPI(console);
  }

  public async upsyncChangesToHubspot(hubspot: Hubspot): Promise<UploadResult> {
    const result: UploadResult = {
      deals: emptyEntityResult(),
      contacts: emptyEntityResult(),
      companies: emptyEntityResult(),
      associations: { created: 0, deleted: 0 },
    };

    if (deleteBlockingDeals() && hubspot.dealManager.blockingDeals.size > 0) {
      await this.deleteBlockingDeals(hubspot.dealManager);
    }

    result.deals = await this.trySyncProperties(hubspot.dealManager);
    result.contacts = await this.trySyncProperties(hubspot.contactManager);
    result.companies = await this.trySyncProperties(hubspot.companyManager);

    const dealAssoc = await this.syncUpAllAssociations(hubspot.dealManager);
    const contactAssoc = await this.syncUpAllAssociations(hubspot.contactManager);
    const companyAssoc = await this.syncUpAllAssociations(hubspot.companyManager);

    result.associations.created = dealAssoc.created + contactAssoc.created + companyAssoc.created;
    result.associations.deleted = dealAssoc.deleted + contactAssoc.deleted + companyAssoc.deleted;

    return result;
  }

  private async deleteBlockingDeals(dealManager: DealManager) {
    const blockingDealsIds = dealManager.blockingDealIds()
    this.#console?.printInfo(`Deleting ${blockingDealsIds.length} deals (blocking deals and their duplicates)`);
    return this.api.archiveEntities(dealManager.entityAdapter.kind, blockingDealsIds.map(id => ({ id })))
  }

  private async trySyncProperties<D extends Record<string, any>, E extends Entity<D>>(manager: EntityManager<D, E>): Promise<EntityUploadResult> {
    try {
      return await this.syncUpAllEntitiesProperties(manager);
    } catch (e) {
      this.#console?.printError('Uploader', `Failed to sync ${manager.entityAdapter.kind} properties`, e);
      return emptyEntityResult();
    }
  }

  private async syncUpAllEntitiesProperties<D extends Record<string, any>, E extends Entity<D>>(manager: EntityManager<D, E>): Promise<EntityUploadResult> {
    const kind = manager.entityAdapter.kind;
    const syncTimestamp = new Date().toISOString();
    const entitiesWithChanges = manager.getArray().map(e => ({ e, changes: e.getPropertyChanges() }));
    const toSync = entitiesWithChanges.filter(({ changes }) => Object.keys(changes).length > 0);

    const toCreate = toSync.filter(({ e }) => e.id === null);
    const toUpdate = toSync.filter(({ e }) => e.id !== null);
    const unchanged = entitiesWithChanges.length - toSync.length;

    const failed: FailedUploadRecord[] = [];

    if (toCreate.length > 0) {
      const created = await this.api.createEntities(
        kind,
        toCreate.map(({ changes }) => ({
          properties: changes as Record<string, string>,
        }))
      );

      for (const { index, result } of created) {
        toCreate[index].e.id = result.id;
      }

      // Track failed creates
      for (const { e, changes } of toCreate) {
        if (e.id === null) {
          failed.push({
            syncTimestamp,
            entityKind: kind,
            operation: 'create',
            entityId: null,
            properties: changes as Record<string, string>,
            errorMessage: 'Batch create failed',
            retryCount: 0,
          });
        }
      }

      const unmatched = toCreate.filter(({ e }) => e.id === null).length;
      if (unmatched > 0) {
        this.#console?.printWarning('Uploader', `${unmatched} ${kind}(s) not created (failed batches)`);
      }
    }

    if (toUpdate.length > 0) {
      const updated = await this.api.updateEntities(
        kind,
        toUpdate.map(({ e, changes }) => ({
          id: e.guaranteedId(),
          properties: changes as Record<string, string>,
        }))
      );

      // Track failed updates (submitted but not returned)
      const updatedIds = new Set(updated.map(u => u.id));
      for (const { e, changes } of toUpdate) {
        if (!updatedIds.has(e.guaranteedId())) {
          failed.push({
            syncTimestamp,
            entityKind: kind,
            operation: 'update',
            entityId: e.guaranteedId(),
            properties: changes as Record<string, string>,
            errorMessage: 'Batch update failed',
            retryCount: 0,
          });
        }
      }
    }

    return {
      created: toCreate.length - failed.filter(f => f.operation === 'create').length,
      updated: toUpdate.length - failed.filter(f => f.operation === 'update').length,
      failed,
      unchanged,
    };
  }

  private async syncUpAllAssociations<D extends Record<string, any>, E extends Entity<D>>(
    manager: EntityManager<D, E>
  ): Promise<{ created: number; deleted: number }> {
    let created = 0;
    let deleted = 0;

    const toSync = (manager.getArray()
      .filter(e => e.hasAssociationChanges())
      .flatMap(e => e.getAssociationChanges()
        .map(({ op, other, labels }) => ({ op, from: e, to: other, labels }))));

    const upAssociations = (Object.entries(manager.entityAdapter.associations)
      .filter(([kind, dir]) => dir.includes('up'))
      .map(([kind, dir]) => kind as EntityKind));

    for (const otherKind of upAssociations) {
      const toSyncInKind = (toSync
        .filter(changes => changes.to.kind === otherKind)
        .filter(changes => {
          if (!changes.from.id || !changes.to.id) {
            this.#console?.printError("Uploader", `Will skip association of [${changes.to.kind}] between [${changes.from.id ?? 'unknown'}] and [${changes.to.id ?? 'unknown'}] due to missing Id`);
            return false;
          }
          return true;
        })
        .map(changes => ({
          ...changes,
          inputs: {
            fromId: changes.from.guaranteedId(),
            toId: changes.to.guaranteedId(),
            toType: otherKind,
            labels: changes.labels,
          }
        })));

      const toAdd = toSyncInKind.filter(changes => changes.op === 'add');
      const toDel = toSyncInKind.filter(changes => changes.op === 'del');

      // Delete before create: HubSpot enforces 1 primary company per deal,
      // so the old association must be removed before a new one can be added.
      await this.api.deleteAssociations(
        manager.entityAdapter.kind,
        otherKind,
        toDel.map(changes => changes.inputs),
      );

      await this.api.createAssociations(
        manager.entityAdapter.kind,
        otherKind,
        toAdd.map(changes => changes.inputs),
      );

      created += toAdd.length;
      deleted += toDel.length;
    }

    return { created, deleted };
  }

}
