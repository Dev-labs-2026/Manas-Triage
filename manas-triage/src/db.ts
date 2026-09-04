import Dexie, { type Table } from 'dexie';
import type { TriageRecord } from './types'
export class ManasDatabase extends Dexie {
  triageRecords!: Table<TriageRecord, number>;

  constructor() {
    super('ManasTriageDB');
    this.version(1).stores({
      triageRecords: '++id, timestamp, severity, patientType'
    });
  }
}

export const db = new ManasDatabase();