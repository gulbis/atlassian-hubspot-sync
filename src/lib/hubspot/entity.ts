import { AssociationLabel, EntityAdapter, EntityKind, FullEntity, RelativeAssociation } from "./interfaces";

export interface Indexer<D extends Record<string, any>> {
  removeIndexesFor<K extends keyof D>(key: K, entity: Entity<D>): void;
  addIndexesFor<K extends keyof D>(key: K, val: D[K] | undefined, entity: Entity<D>): void;
}

export abstract class Entity<D extends Record<string, any>> {

  public id: string | null;

  private _oldData: D = Object.create(null);
  private newData: D = Object.create(null);

  private oldAssocs = new Set<Entity<any>>();
  private newAssocs = new Set<Entity<any>>();

  private oldAssocLabels = new Map<Entity<any>, AssociationLabel[]>();
  private newAssocLabels = new Map<Entity<any>, AssociationLabel[]>();

  public readonly data: D;

  /** Don't call directly; use manager.create() */
  public constructor(
    id: string | null,
    public adapter: EntityAdapter<D>,
    protected downloadedData: Record<string, string>,
    data: D,
    private indexer: Indexer<D>,
  ) {
    this.id = id;
    if (id) Object.assign(this._oldData, data);
    Object.assign(this.newData, data);

    type K = keyof D;
    this.data = new Proxy(this.newData, {
      set: (_target, _key, _val) => {
        const key = _key as K;
        const val = _val as D[K];
        if (!this._oldData[key] || !this.#isFieldManaged(key as string)) {
          this.indexer.removeIndexesFor(key, this);
          this.newData[key] = val;
          this.indexer.addIndexesFor(key, val, this);
        }
        return true;
      },
    });
  }

  #isFieldManaged(key: string): boolean {
    const hsFieldName = this.adapter.data[key].property;
    if (!hsFieldName) return false;
    return this.adapter.managedFields.has(hsFieldName);
  }

  get kind() {
    return this.adapter.kind;
  }

  public guaranteedId() {
    if (!this.id) throw new Error('Trying to access null deal id!');
    return this.id;
  }

  // Properties

  public hasPropertyChanges() {
    return Object.keys(this.getPropertyChanges()).length > 0;
  }

  public getPropertyChanges() {
    const upProperties: Partial<{ [K in keyof D]: string }> = Object.create(null);
    for (const [k, v] of Object.entries(this.newData)) {
      const spec = this.adapter.data[k];
      const oldValue = this._oldData[k];

      const compString1 = oldValue === undefined ? '' : (spec.makeComparable?.(oldValue) ?? oldValue);
      const compString2 = spec.makeComparable?.(v) ?? v;

      if (compString1 !== compString2) {
        if (spec.property) {
          const upKey = spec.property as keyof D;
          const upVal = spec.up(v);
          upProperties[upKey] = upVal;
        }
      }
    }
    return upProperties;
  }

  // Associations

  protected makeDynamicAssociation<T extends Entity<any>>(kind: EntityKind) {
    return {
      getAll: () => this.getAssociations(kind) as T[],
      add: (entity: T, labels?: AssociationLabel[]) => this.addAssociation(entity, { firstSide: true, initial: false, labels }),
      clear: () => this.clearAssociations(kind),
    };
  }

  /** Don't use directly; use deal.contacts.add(c) etc. */
  public addAssociation(entity: Entity<any>, meta: { firstSide: boolean, initial: boolean, labels?: AssociationLabel[] }) {
    if (meta.initial) {
      this.oldAssocs.add(entity);
      if (meta.labels?.length) this.oldAssocLabels.set(entity, meta.labels);
    }
    this.newAssocs.add(entity);
    if (meta.labels?.length) this.newAssocLabels.set(entity, meta.labels);

    // Labels are directional — don't propagate to reverse side
    if (meta.firstSide) entity.addAssociation(this, { firstSide: false, initial: meta.initial });
  }

  private getAssociations(kind: EntityKind) {
    return [...this.newAssocs].filter(e => e.adapter.kind === kind);
  }

  private clearAssociations(kind: EntityKind) {
    for (const e of this.newAssocs) {
      if (e.adapter.kind === kind) {
        this.newAssocs.delete(e);
        this.newAssocLabels.delete(e);
      }
    }
  }

  public hasAssociationChanges() {
    return (
      [...this.oldAssocs].some(e => !this.newAssocs.has(e)) ||
      [...this.newAssocs].some(e => !this.oldAssocs.has(e)) ||
      [...this.newAssocs].filter(e => this.oldAssocs.has(e)).some(e =>
        !labelsEqual(this.oldAssocLabels.get(e) ?? [], this.newAssocLabels.get(e) ?? [])
      )
    );
  }

  public getAssociationChanges() {
    const toAdd = [...this.newAssocs].filter(e => !this.oldAssocs.has(e));
    const toDel = [...this.oldAssocs].filter(e => !this.newAssocs.has(e));

    // Detect label-only changes: entity stayed but labels differ
    const labelChanged = [...this.newAssocs]
      .filter(e => this.oldAssocs.has(e))
      .filter(e => !labelsEqual(this.oldAssocLabels.get(e) ?? [], this.newAssocLabels.get(e) ?? []));

    return [
      ...toDel.map(e => ({ op: 'del' as const, other: e, labels: this.oldAssocLabels.get(e) })),
      ...labelChanged.map(e => ({ op: 'del' as const, other: e, labels: this.oldAssocLabels.get(e) })),
      ...toAdd.map(e => ({ op: 'add' as const, other: e, labels: this.newAssocLabels.get(e) })),
      ...labelChanged.map(e => ({ op: 'add' as const, other: e, labels: this.newAssocLabels.get(e) })),
    ] as { op: 'add' | 'del', other: Entity<any>, labels?: AssociationLabel[] }[];
  }

  // Back transformation

  public toRawEntity(): FullEntity {
    return {
      id: this.id!,
      properties: this.upsyncableData(),
      associations: [...this.upsyncableAssociations()].map(other => {
        return `${this.kind}_to_${other.kind}:${other.id}` as RelativeAssociation;
      }),
    };
  }

  private upsyncableData() {
    const upProperties: Record<string, string> = { ...this.downloadedData };
    for (const [k, v] of Object.entries(this.newData)) {
      const spec = this.adapter.data[k];
      if (spec.property) {
        const upKey = spec.property;
        const upVal = spec.up(v);
        upProperties[upKey] = upVal;
      }
    }
    return upProperties;
  }

  private upsyncableAssociations() {
    return [...this.newAssocs].filter(other => {
      const found = this.adapter.associations[other.kind];
      return found?.includes('up');
    });
  }

}

function labelsEqual(a: AssociationLabel[], b: AssociationLabel[]): boolean {
  if (a.length !== b.length) return false;
  const sortKey = (l: AssociationLabel) => `${l.associationCategory}:${l.associationTypeId}`;
  const sortedA = [...a].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
  const sortedB = [...b].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
  return sortedA.every((l, i) =>
    l.associationCategory === sortedB[i].associationCategory &&
    l.associationTypeId === sortedB[i].associationTypeId
  );
}
