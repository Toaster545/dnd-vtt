import { expect, test } from '@playwright/test';

test('replication produces usable equipment and survives reload on desktop and mobile', async ({ page, request }, testInfo) => {
  const suffix = `magic-${testInfo.project.name}-${Date.now()}`;
  const email = `${suffix}@example.test`;
  const password = 'magic-items-test-pass';
  expect((await request.post('/api/auth/register', { data: { email, password, username: suffix.slice(-24) } })).ok()).toBeTruthy();
  const login = await request.post('/api/auth/login', { data: { email, password } });
  const { access_token } = await login.json();
  const character = await request.post('/api/characters', {
    headers: { Authorization: `Bearer ${access_token}` },
    data: {
      name: 'Alberto Inventory Test', race: 'Gnome', class: 'Artificer', subclass: 'Battle Smith', level: 3,
      classes: [{ name: 'Artificer', subclass: 'Battle Smith', level: 3, choices: { magic_item_plans: ['Bag of Holding', 'Weapon +1', 'Returning Weapon', 'Wand of the War Mage +1'] } }],
      ability_scores: { strength: 6, dexterity: 16, constitution: 14, intelligence: 18, wisdom: 12, charisma: 10 },
      background: 'Scribe', enabled_sources: ['XPHB', 'EFA'], max_hp: 24, current_hp: 8, temp_hp: 0, armor_class: 13,
      speed: 30, skills: {}, expertise: {}, equipment: [{ itemIndex: 'tinkers-tools', name: "Tinker's Tools", quantity: 1, equipped: false }], spells: [], resource_uses: {}, spell_slots_used: {},
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
  const selectSection = async (section: 'inventory' | 'actions') => {
    if (page.viewportSize()!.width > 640) await page.getByRole('button', { name: section === 'inventory' ? '3 Equipment' : '2 Actions', exact: true }).click();
    else await page.getByLabel('Character sheet section').selectOption(section);
  };
  await selectSection('inventory');
  const inventory = page.locator('app-magic-inventory');
  await inventory.getByRole('button', { name: 'Long Rest', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(inventory).toContainText('0 / 2 active');
  await inventory.getByRole('button', { name: 'Long Rest', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Complete Long Rest' });
  await dialog.getByLabel('Returning Weapon', { exact: true }).check();
  await dialog.getByLabel('Weapon to create').selectOption('dagger');
  await expect(dialog).toContainText('Create: Returning Dagger +1');
  await dialog.getByLabel('I have my Tinker’s Tools in hand.').check();
  await dialog.getByRole('button', { name: 'Complete Long Rest', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const weapon = inventory.locator('section.item').filter({ has: page.locator('strong', { hasText: 'Returning Dagger +1' }) });
  await weapon.getByRole('button', { name: 'Equip', exact: true }).click();
  await expect(weapon.getByRole('button', { name: 'Equipped', exact: true })).toBeVisible();
  await page.reload(); await selectSection('inventory');
  await expect(inventory).toContainText('1 / 2 active');
  await expect(weapon.getByRole('button', { name: 'Equipped', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await weapon.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('magic-inventory.png'), fullPage: true, animations: 'disabled' });
  await selectSection('actions');
  await expect(page.getByText('Returning Dagger +1', { exact: false }).first()).toBeVisible();
  // Inspect rendered combat output without depending on a particular card class.
  await expect(page.locator('app-character-play-sheet')).toContainText('1d4+5');
  await expect(page.locator('app-character-play-sheet')).toContainText('+7');
  await page.screenshot({ path: testInfo.outputPath('magic-attack.png'), fullPage: true, animations: 'disabled' });
});
