import type { RecordService } from '../contracts';
import { listRecords } from '@/storage/records';

// 데모 기록은 기기 저장값이 전부다.
export const demoRecordService: RecordService = {
  async list(options) {
    const records = await listRecords();
    if (!options?.level) return records;
    const status = options.level === 1 ? 'level-1' : 'level-2';
    return records.filter((record) => record.status === status);
  },
  async get(recordId) {
    return (await listRecords()).find((record) => record.id === recordId) ?? null;
  },
  async latest() {
    const record = (await listRecords())[0] ?? null;
    return { record, coordinate: record?.place.coordinate ?? null, dataPeriod: null };
  },
};
