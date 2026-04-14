import * as hubspot from '@hubspot/api-client';
import { hubspotCredsFromENV } from '../config/env';
import { ConsoleLogger } from '../log/console';
import { KnownError } from '../util/errors';
import { batchesOf, isPresent } from '../util/helpers';
import {Association, EntityAdapter, EntityId, EntityKind, ExistingEntity, IndexedEntity, NewEntity, RelativeAssociation} from './interfaces'
import { typedEntries } from './manager';

export type HubspotCreds = {
  accessToken: string,
  basePath?: string,
};

export default class HubspotAPI {

  private client: hubspot.Client;

  constructor(private console?: ConsoleLogger) {
    this.client = new hubspot.Client({
      ...hubspotCredsFromENV(),
      numberOfApiCallRetries: 3,
    });
  }

  public async downloadHubspotEntities<D>(entityAdapter: EntityAdapter<D>) {
    const inputAssociations = (Object.entries(entityAdapter.associations)
      .filter(([kind, dir]) => dir.includes('down'))
      .map(([kind, dir]) => kind));

    const apiProperties = [
      ...typedEntries(entityAdapter.data).map(([k, v]) => v.property).filter(isPresent),
      ...entityAdapter.additionalProperties,
    ];

    const associations = ((inputAssociations.length > 0)
      ? inputAssociations
      : undefined);

    try {
      const entities = await this.apiFor(entityAdapter.kind).getAll(undefined, undefined, apiProperties, undefined, associations);
      const normalizedEntities = entities.map(({ id, properties, associations }) => ({
        id,
        properties: properties as Record<string, string>,
        associations: Object.entries(associations || {})
          .flatMap(([, { results }]) => (
            results.map(item =>
              `${item.type}:${item.id}` as RelativeAssociation
            )
          )),
      }));
      return normalizedEntities;
    }
    catch (e: any) {
      const body = e.body ?? e.response?.body;
      if (
        (
          typeof body === 'string' && (
            body === 'internal error' ||
            body.startsWith('<!DOCTYPE html>'))
        ) || (
          typeof body === 'object' &&
          body.status === 'error' &&
          body.message === 'internal error'
        )
      ) {
        throw new KnownError(`Hubspot API for "${entityAdapter.kind}" had internal error.`);
      }
      else {
        throw new Error(`Failed downloading ${entityAdapter.kind}s.\n  Response body: ${JSON.stringify(body)}\n  Error stacktrace: ${e.stack}`);
      }
    }
  }

  public async archiveEntities(kind: EntityKind, entities: EntityId[]): Promise<void> {
    await this.batchUpsert(kind, entities, async (batch) => {
      await this.apiFor(kind).batchApi.archive({ inputs: batch });
    });
  }

  public async createEntities(kind: EntityKind, entities: NewEntity[]): Promise<IndexedEntity[]> {
    const groups = batchesOf(entities, 100);
    const indexed: IndexedEntity[] = [];
    let offset = 0;

    for (const batch of groups) {
      try {
        const result = await this.apiFor(kind).batchApi.create({ inputs: batch });
        for (let i = 0; i < result.results.length; i++) {
          indexed.push({ index: offset + i, result: result.results[i] as unknown as ExistingEntity });
        }
      } catch (err: any) {
        const msg = err.body?.message ?? err.message ?? String(err);
        this.console?.printError('HubSpot API', `Error creating ${kind} batch (offset ${offset}, size ${batch.length}): ${String(msg).substring(0, 200)}`);
      }
      offset += batch.length;
    }

    return indexed;
  }

  public async updateEntities(kind: EntityKind, entities: ExistingEntity[]): Promise<ExistingEntity[]> {
    const updated: ExistingEntity[] = [];
    await this.batchUpsert(kind, entities, async (batch) => {
      const result = await this.apiFor(kind).batchApi.update({inputs: batch});
      updated.push(...result.results as unknown as ExistingEntity[]);
    });
    return updated;
  }

  private async batchUpsert<T, U>(kind: EntityKind, entities: T[], fn: (array: T[]) => Promise<unknown>): Promise<void> {
    const entityGroups = batchesOf(entities, 100);

    for (const batch of entityGroups) {
      try {
        await fn(batch);
      }
      catch (e: any) {
        const errMsg = e.body?.message ?? e.message ?? e;
        this.console?.printError('HubSpot API', `Batch ${kind} error: ${String(errMsg).substring(0, 200)}`);
      }
    }
  }

  public async createAssociations(fromKind: EntityKind, toKind: EntityKind, inputs: Association[]): Promise<void> {
    const labeled = inputs.filter(i => i.labels?.length);
    const unlabeled = inputs.filter(i => !i.labels?.length);

    // HubSpot v4 batch endpoints accept max 100 inputs per request
    // Unlabeled: v4 batch associate default
    for (const inputBatch of batchesOf(unlabeled, 100)) {
      await this.v4AssocRequest(
        'POST',
        `/crm/v4/associations/${fromKind}/${toKind}/batch/associate/default`,
        { inputs: inputBatch.map(i => ({ from: { id: i.fromId }, to: { id: i.toId } })) },
        `creating default associations ${fromKind}->${toKind}`,
      );
    }

    // Labeled: v4 batch create with types
    for (const inputBatch of batchesOf(labeled, 100)) {
      await this.v4AssocRequest(
        'POST',
        `/crm/v4/associations/${fromKind}/${toKind}/batch/create`,
        { inputs: inputBatch.map(i => ({ from: { id: i.fromId }, to: { id: i.toId }, types: i.labels! })) },
        `creating labeled associations ${fromKind}->${toKind}`,
      );
    }
  }

  public async deleteAssociations(fromKind: EntityKind, toKind: EntityKind, inputs: Association[]): Promise<void> {
    for (const inputBatch of batchesOf(inputs, 100)) {
      await this.v4AssocRequest(
        'POST',
        `/crm/v4/associations/${fromKind}/${toKind}/batch/archive`,
        { inputs: inputBatch.map(i => ({ from: { id: i.fromId }, to: [{ id: i.toId }] })) },
        `deleting associations ${fromKind}->${toKind}`,
      );
    }
  }

  private async v4AssocRequest(method: string, path: string, body: any, context: string): Promise<void> {
    try {
      const response = await this.client.apiRequest({ method, path, body });
      const status = (response as any).status ?? (response as any).statusCode;
      if (status && status >= 400) {
        const text = typeof (response as any).json === 'function'
          ? JSON.stringify(await (response as any).json())
          : String(response);
        this.console?.printError('HubSpot API', `Error ${context}: HTTP ${status} — ${text}`);
      }
    } catch (err: any) {
      const msg = err.body?.message ?? err.message ?? String(err);
      this.console?.printError('HubSpot API', `Error ${context}: ${String(msg).substring(0, 300)}`);
    }
  }

  private apiFor(kind: EntityKind) {
    switch (kind) {
      case 'deal': return this.client.crm.deals;
      case 'company': return this.client.crm.companies;
      case 'contact': return this.client.crm.contacts;
    }
  }

}
