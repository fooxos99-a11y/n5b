export type Scope = Readonly<{ tenant: string; account: string }>;
export type ProbeRecord = { kind: 'draft' | 'session'; operationId: string; selectedLocations: string[]; createdAt: string };
type Row = { payload: string };
export interface DatabasePort {
  exec(sql: string): Promise<void>;
  run(sql: string, ...params: string[]): Promise<void>;
  first(sql: string, ...params: string[]): Promise<Row | null>;
  transaction(work: (transaction: DatabasePort) => Promise<void>): Promise<void>;
}
const token = /^[a-zA-Z0-9._:-]{1,128}$/;
function validateScope(scope: Scope) {
  if (!token.test(scope.tenant) || !token.test(scope.account)) throw new Error('سياق التخزين غير صالح.');
}
export function validateRecord(value: unknown): ProbeRecord {
  if (typeof value !== 'object' || value === null) throw new Error('بيانات التجربة غير صالحة.');
  const record = value as Record<string, unknown>;
  if (!['draft', 'session'].includes(String(record.kind)) || typeof record.operationId !== 'string'
    || !token.test(record.operationId) || typeof record.createdAt !== 'string'
    || !Number.isFinite(Date.parse(record.createdAt)) || !Array.isArray(record.selectedLocations)
    || record.selectedLocations.length > 1000
    || record.selectedLocations.some(location => typeof location !== 'string' || !/^\d+:\d+:\d+$/.test(location))) {
    throw new Error('بيانات التجربة غير صالحة.');
  }
  return { kind: record.kind as ProbeRecord['kind'], operationId: record.operationId,
    createdAt: record.createdAt, selectedLocations: record.selectedLocations as string[] };
}

export class ProbeStore {
  constructor(private database: DatabasePort, private scope: Scope) { validateScope(scope); }
  async initialize() {
    await this.database.exec(`CREATE TABLE IF NOT EXISTS native_probe_records (
      tenant TEXT NOT NULL, account TEXT NOT NULL, kind TEXT NOT NULL,
      operation_id TEXT NOT NULL, payload TEXT NOT NULL,
      PRIMARY KEY (tenant, account, kind, operation_id))`);
  }
  async save(records: ProbeRecord[]) {
    const validated = records.map(validateRecord);
    await this.database.transaction(async tx => {
      for (const record of validated) {
        await tx.run(`INSERT INTO native_probe_records (tenant, account, kind, operation_id, payload)
          VALUES (?, ?, ?, ?, ?) ON CONFLICT (tenant, account, kind, operation_id) DO NOTHING`,
        this.scope.tenant, this.scope.account, record.kind, record.operationId, JSON.stringify(record));
      }
    });
  }
  async restore(kind: ProbeRecord['kind'], operationId: string): Promise<ProbeRecord | null> {
    if (!token.test(operationId)) throw new Error('معرف العملية غير صالح.');
    const row = await this.database.first(`SELECT payload FROM native_probe_records
      WHERE tenant = ? AND account = ? AND kind = ? AND operation_id = ?`,
    this.scope.tenant, this.scope.account, kind, operationId);
    return row ? validateRecord(JSON.parse(row.payload)) : null;
  }
}
