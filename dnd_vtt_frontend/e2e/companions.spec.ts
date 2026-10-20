import { expect, test } from '@playwright/test';

test('companion creation, HP persistence, commands and mobile tab navigation', async ({ page, request }, testInfo) => {
  const suffix = `pet-${testInfo.project.name}-${Date.now()}`;
  const email = `${suffix}@example.test`;
  const password = 'companion-test-pass';
  expect((await request.post('/api/auth/register', { data: { email, password, username: suffix.slice(-24) } })).ok()).toBeTruthy();
  const login = await request.post('/api/auth/login', { data: { email, password } });
  const { access_token } = await login.json();
  const character = await request.post('/api/characters', {
    headers: { Authorization: `Bearer ${access_token}` },
    data: {
      name: 'Companion Test Ranger', race: 'Human', class: 'Ranger', subclass: 'Beast Master', level: 5,
      classes: [{ name: 'Ranger', subclass: 'Beast Master', level: 5, choices: {} }],
      ability_scores: { strength: 10, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 18, charisma: 10 },
      background: 'Guide', enabled_sources: ['XPHB'], max_hp: 40, current_hp: 40, temp_hp: 0, armor_class: 14,
      speed: 30, skills: {}, expertise: {}, equipment: [], spells: [], resource_uses: {}, spell_slots_used: {},
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, death_saves: { successes: 0, failures: 0 }, conditions: [], hit_dice_used: 0,
    },
  });
  expect(character.ok()).toBeTruthy();
  const { id } = await character.json();
  await page.goto('/auth/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/home\/dashboard/);
  await page.goto(`/home/characters/${id}`);
  const selectSection = async (section: string) => {
    if (page.viewportSize()!.width > 640) await page.getByRole('button', { name: section === 'companions' ? '5 Companions' : '2 Actions', exact: true }).click();
    else await page.getByLabel('Character sheet section').selectOption(section);
  };
  await selectSection('companions');
  await page.getByRole('button', { name: 'Summon beast', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Primal Companion', exact: true })).toBeVisible();
  const sheet = page.locator('app-companion-sheet');
  await expect(sheet).toContainText('30/30');
  await sheet.locator('summary').filter({ hasText: 'Adjust HP' }).click();
  await page.getByLabel('HP adjustment', { exact: true }).fill('7');
  await page.getByRole('button', { name: 'Damage', exact: true }).click();
  await expect(sheet).toContainText('23/30');
  await page.reload(); await selectSection('companions');
  await expect(sheet).toContainText('23/30');
  await selectSection('actions');
  await page.getByRole('button', { name: 'Command Primal Companion · Bonus Action', exact: true }).click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'Reactions', exact: true })).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'Basic actions', exact: true })).toBeVisible();
  const help = sheet.locator('details.basic-action').filter({ has: page.locator('summary', { hasText: 'Help' }) });
  await expect(help).not.toHaveAttribute('open');
  await help.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(help.getByRole('button', { name: 'Command · Bonus Action', exact: true })).toBeVisible();
  await expect(help.getByRole('button', { name: 'Command · Replace attack', exact: true })).toHaveCount(0);
  await help.locator('summary').click();
  await sheet.locator('summary').filter({ hasText: 'Adjust HP' }).click();
  await page.getByLabel('HP adjustment', { exact: true }).fill('99');
  await page.getByRole('button', { name: 'Damage', exact: true }).click();
  const recovery = sheet.locator('details.recovery');
  await expect(recovery).toHaveAttribute('open');
  await expect(recovery).toContainText('Magic action');
  await recovery.getByRole('button', { name: 'Complete revival', exact: false }).click();
  await expect(sheet).toContainText('30/30');
  await expect(recovery).not.toHaveAttribute('open');
  await sheet.locator('summary').filter({ hasText: 'Adjust HP' }).click();
  const viewport = page.viewportSize()!;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
  await page.screenshot({ path: testInfo.outputPath('companions.png'), fullPage: true, animations: 'disabled' });
  await help.locator('summary').click();
  await recovery.locator('summary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('companion-actions.png'), animations: 'disabled' });
});
