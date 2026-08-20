import { expect, test } from '@playwright/test';

test('manifest is installable and excludes authenticated API caching', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  expect(await manifest.json()).toMatchObject({ name: 'NatOne', start_url: '/home/dashboard', display: 'standalone' });
  const worker = await request.get('/ngsw.json');
  expect(worker.ok()).toBeTruthy();
  const workerConfig = await worker.json() as { dataGroups?: unknown[] };
  expect(workerConfig.dataGroups ?? []).toEqual([]);
});

test('protected mobile route recovers to sign in', async ({ page }) => {
  await page.goto('/home/dashboard');
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
});

test('account can sign in and sees responsive player navigation', async ({ page, request }, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`.replace(/[^a-z0-9-]/gi, '').toLowerCase();
  const email = `${suffix}@example.test`;
  const password = 'playwright-pass';
  await request.post('/api/auth/register', { data: { email, password, username: suffix.slice(0, 24) } });
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/home\/dashboard/);
  if (testInfo.project.name !== 'desktop-chromium') {
    await expect(page.getByRole('navigation', { name: 'Player navigation' })).toBeVisible();
  }
});
