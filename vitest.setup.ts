import { vi } from 'vitest';

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'zh', languageTag: 'zh-CN' }],
}));
