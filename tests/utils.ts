import { test as baseTest } from '@playwright/test';

export const test = baseTest.extend({
  page: async ({ page }, use) => {
    await use(page);
  },
});

export function sleep(baseDuration: number) {
  const variation = (Math.random() * 10 - 5) * 1000;
  const duration = baseDuration * 1000 + variation;
  test.setTimeout(duration + 5000);
  return new Promise(resolve => setTimeout(resolve, duration));
}
