// Big Buy HRMS — Branch Manager / GM role and leave-chain tests
// App: https://bigbuy-hrms.vercel.app (override with PLAYWRIGHT_BASE_URL)
//
// Kept in its own file (not hrms.spec.js) because each test here logs in as
// a different role explicitly — sharing hrms.spec.js's Master-only
// beforeEach would skip these whenever Master creds aren't set, even if
// BM/GM creds are.
//
// Required env vars (tests needing a credential that isn't set are skipped):
//   BM_USERNAME / BM_PASSWORD / BM_BRANCH   (a seeded Branch Manager account + its branch name)
//   GM_USERNAME / GM_PASSWORD               (the seeded GM account)
//   MASTER_USERNAME / MASTER_PASSWORD       (used only by the leave-chain test)

import { test, expect } from '@playwright/test';

async function navTo(page, label) {
  await page.locator('aside button').filter({ hasText: label }).first().click();
  await page.waitForTimeout(800);
}

async function settle(page, ms = 1500) {
  try {
    await page.waitForLoadState('networkidle', { timeout: ms });
  } catch {
    try { await page.waitForTimeout(ms); } catch { /* page closed between tests — ignore */ }
  }
}

// Supabase Auth rejects re-setting the same password on the forced-change
// screen ("must differ from old"), so a first successful run permanently
// changes the account's password away from `password`. To stay idempotent
// across repeated test runs without knowing which state an account is in,
// try `password` first, then this derived fallback (what a prior run's
// forced-change would have set it to).
function altPasswordFor(password) {
  return `${password}-Test1`;
}

async function attemptLogin(page, username, password) {
  await page.goto('/');
  await page.locator('input[autocomplete="username"]').waitFor({ timeout: 15000 });
  await page.fill('input[autocomplete="username"]', username);
  await page.fill('input[autocomplete="current-password"]', password);
  await page.click('button[type="submit"]');

  const invalid = page.locator('text=Invalid username or password');
  const changePassword = page.locator('text=Set a new password');
  const sidebar = page.locator('aside');
  await Promise.race([
    invalid.waitFor({ timeout: 10000 }),
    changePassword.waitFor({ timeout: 10000 }),
    sidebar.waitFor({ timeout: 10000 }),
  ]).catch(() => {});

  if (await invalid.isVisible().catch(() => false)) return 'invalid';
  if (await changePassword.isVisible().catch(() => false)) return 'change-password';
  if (await sidebar.isVisible().catch(() => false)) return 'ok';
  return 'unknown';
}

async function loginAs(page, username, password) {
  const alt = altPasswordFor(password);
  let result = await attemptLogin(page, username, password);
  let activePassword = password;
  if (result === 'invalid') {
    result = await attemptLogin(page, username, alt);
    activePassword = alt;
  }
  if (result === 'change-password') {
    const pwInputs = page.locator('input[autocomplete="new-password"]');
    await pwInputs.nth(0).fill(alt);
    await pwInputs.nth(1).fill(alt);
    await page.click('button[type="submit"]');
  } else if (result !== 'ok') {
    throw new Error(`Login failed for ${username} (state: ${result})`);
  }
  await page.locator('aside').waitFor({ timeout: 15000 });
}

// ═══════════════════════════════════════════════════════════════════════════
// BRANCH MANAGER ROLE
// ═══════════════════════════════════════════════════════════════════════════

test('Branch Manager login works', async ({ page }) => {
  test.skip(!process.env.BM_USERNAME || !process.env.BM_PASSWORD, 'BM_USERNAME/BM_PASSWORD not set');
  await loginAs(page, process.env.BM_USERNAME, process.env.BM_PASSWORD);
  await expect(page.locator('text=Branch Manager').first()).toBeVisible();
  await page.screenshot({ path: 'tests/results/screenshots/bm-login.png' });
});

test('Branch Manager sees only their branch employees', async ({ page }) => {
  test.skip(!process.env.BM_USERNAME || !process.env.BM_PASSWORD || !process.env.BM_BRANCH,
    'BM_USERNAME/BM_PASSWORD/BM_BRANCH not set');
  await loginAs(page, process.env.BM_USERNAME, process.env.BM_PASSWORD);
  await navTo(page, 'Employees');
  await settle(page, 2000);

  const branchCells = page.locator('table tbody tr td:nth-child(5)');
  const count = await branchCells.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(branchCells.nth(i)).toHaveText(process.env.BM_BRANCH);
  }
  console.log(`  ✓ All ${count} employee rows scoped to ${process.env.BM_BRANCH}`);
});

test('Branch Manager cannot see Payroll in sidebar', async ({ page }) => {
  test.skip(!process.env.BM_USERNAME || !process.env.BM_PASSWORD, 'BM_USERNAME/BM_PASSWORD not set');
  await loginAs(page, process.env.BM_USERNAME, process.env.BM_PASSWORD);
  await expect(page.locator('aside button').filter({ hasText: 'Payroll' })).toHaveCount(0);
  await expect(page.locator('aside button').filter({ hasText: 'Settings' })).toHaveCount(0);
  await expect(page.locator('aside button').filter({ hasText: 'Fines & Penalties' })).toHaveCount(0);
});

test('Branch Manager cannot see other branch data', async ({ page }) => {
  test.skip(!process.env.BM_USERNAME || !process.env.BM_PASSWORD || !process.env.BM_BRANCH,
    'BM_USERNAME/BM_PASSWORD/BM_BRANCH not set');
  await loginAs(page, process.env.BM_USERNAME, process.env.BM_PASSWORD);
  await navTo(page, 'Dashboard');
  await settle(page, 2000);
  // Branch Manager's Dashboard has only one tab (Branch View) and defaults to it directly.
  await expect(page.locator('text=' + process.env.BM_BRANCH).first()).toBeVisible();
  await expect(page.locator('button').filter({ hasText: 'All Branches' })).toHaveCount(0);
});

// ═══════════════════════════════════════════════════════════════════════════
// GM ROLE
// ═══════════════════════════════════════════════════════════════════════════

test('GM login works', async ({ page }) => {
  test.skip(!process.env.GM_USERNAME || !process.env.GM_PASSWORD, 'GM_USERNAME/GM_PASSWORD not set');
  await loginAs(page, process.env.GM_USERNAME, process.env.GM_PASSWORD);
  await expect(page.locator('text=GM').first()).toBeVisible();
  await page.screenshot({ path: 'tests/results/screenshots/gm-login.png' });
});

test('GM sees HR modules', async ({ page }) => {
  test.skip(!process.env.GM_USERNAME || !process.env.GM_PASSWORD, 'GM_USERNAME/GM_PASSWORD not set');
  await loginAs(page, process.env.GM_USERNAME, process.env.GM_PASSWORD);
  await expect(page.locator('aside button').filter({ hasText: 'Employees' }).first()).toBeVisible();
  await expect(page.locator('aside button').filter({ hasText: 'Payroll' }).first()).toBeVisible();
  await expect(page.locator('aside button').filter({ hasText: 'Fines & Penalties' }).first()).toBeVisible();
  await expect(page.locator('aside button').filter({ hasText: 'Approval Queue' }).first()).toBeVisible();
});

test('GM cannot see Publish Payroll button', async ({ page }) => {
  test.skip(!process.env.GM_USERNAME || !process.env.GM_PASSWORD, 'GM_USERNAME/GM_PASSWORD not set');
  await loginAs(page, process.env.GM_USERNAME, process.env.GM_PASSWORD);
  await navTo(page, 'Payroll');
  await settle(page, 2000);
  await expect(page.locator('button').filter({ hasText: 'Publish Payroll' })).toHaveCount(0);
});

// ═══════════════════════════════════════════════════════════════════════════
// LEAVE APPROVAL CHAIN
// ═══════════════════════════════════════════════════════════════════════════

test('Leave approval chain shows correct next stage', async ({ page }) => {
  test.skip(!process.env.MASTER_USERNAME || !process.env.MASTER_PASSWORD, 'MASTER_USERNAME/MASTER_PASSWORD not set');
  const VALID_STAGES = [
    'Pending Supervisor Approval',
    'Pending Branch Manager Approval',
    'Pending HR Approval',
    'Approved',
  ];
  await loginAs(page, process.env.MASTER_USERNAME, process.env.MASTER_PASSWORD);
  await navTo(page, 'Leave');
  await settle(page, 1500);
  await page.locator('button').filter({ hasText: /Approval Queue/ }).first().click();
  await settle(page, 1500);

  const stageBadges = page.locator('table tbody tr td:nth-child(7) span');
  const count = await stageBadges.count();
  if (count === 0) {
    console.log('  ⓘ No pending leave requests currently — nothing to assert against.');
    return;
  }
  for (let i = 0; i < count; i++) {
    const text = (await stageBadges.nth(i).textContent()).trim();
    expect(VALID_STAGES).toContain(text);
  }
  console.log(`  ✓ All ${count} pending leave requests show a valid chain stage`);
});
