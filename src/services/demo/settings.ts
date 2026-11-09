import type {
  NotificationSettings,
  NotificationSettingsService,
  SystemService,
} from '../contracts';
import { wait } from './scenario';

let settings: NotificationSettings = {
  dangerEnabled: true,
  cautionEnabled: true,
  nightEnabled: false,
};

/** 알림 설정(데모). 앱을 다시 열면 기본값으로 돌아간다. */
export const demoNotificationSettingsService: NotificationSettingsService = {
  async get() {
    await wait(200);
    return { ...settings };
  },
  async update(patch) {
    await wait(250);
    settings = { ...settings, ...patch, dangerEnabled: true };
    return { ...settings };
  },
};

export const demoSystemService: SystemService = {
  mode: 'demo',
  baseUrl: null,
  async health() {
    return { ok: true, status: 'DEMO' };
  },
};
