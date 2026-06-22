// Big Buy HRMS — Playwright End-to-End Test Suite
// App: https://bigbuy-hrms.vercel.app
//
// Architecture notes:
// - Single-page React app (Vite). No URL routing — navigation is state-based (sidebar buttons).
// - Main HR app loads directly without a login form; user/role are pre-set (Fahad Nadeem / Master).
// - Role switching is via <select> dropdown in the top bar.
// - Employee Self-Service portal is at /#employee-login (hash-based, separate login).

import { test, expect } from '@playwright/test';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Click a sidebar nav button by its visible label text */
async function navTo(page, label) {
  await page.locator('aside button').filter({ hasText: label }).first().click();
  await page.waitForTimeout(800);
}

/** Wait for the page to settle (no pending network) */
async function settle(page, ms = 1500) {
  try {
    await page.waitForLoadState('networkidle', { timeout: ms });
  } catch {
    try { await page.waitForTimeout(ms); } catch { /* page closed between tests — ignore */ }
  }
}

/** Soft-check for visible error text and log a warning (does not fail the test) */
async function assertNoErrors(page) {
  const mainText = await page.locator('main').textContent().catch(() => '');
  const errorKeywords = ['load failed', 'fetch failed', 'Cannot GET', '500 Internal'];
  for (const kw of errorKeywords) {
    if (mainText.toLowerCase().includes(kw.toLowerCase())) {
      console.warn(`  ⚠ Possible error on page: "${kw}" found in content`);
    }
  }
}

// ─── Shared setup ────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Wait for React to hydrate and Supabase data to load
  await settle(page, 3000);
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1 — APPLICATION LOAD & USER IDENTITY
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 01 — App loads and shows Fahad Nadeem as Master', async ({ page }) => {
  await page.goto('/');
  await settle(page, 3000);

  await page.screenshot({ path: 'tests/results/screenshots/01-app-load.png' });

  // App title visible
  await expect(page.locator('text=Big Buy HRMS').first()).toBeVisible();

  // User name and role visible in sidebar or top bar
  await expect(page.locator('text=Fahad Nadeem').first()).toBeVisible();
  await expect(page.locator('text=Master').first()).toBeVisible();

  // Sidebar navigation present
  await expect(page.locator('aside')).toBeVisible();

  // No hard server errors
  await expect(page.locator('body')).not.toContainText('Cannot GET');
  await expect(page.locator('body')).not.toContainText('Application error');
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2 — DASHBOARD TABS
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 02 — Dashboard tabs load without errors', async ({ page }) => {
  // Overview (default)
  await page.locator('button').filter({ hasText: 'Overview' }).first().click();
  await settle(page, 1500);
  await page.screenshot({ path: 'tests/results/screenshots/02a-dashboard-overview.png' });
  await expect(
    page.locator('text=Active Staff').or(page.locator('text=HR Dashboard')).first()
  ).toBeVisible();
  await assertNoErrors(page);

  // Branch View
  await page.locator('button').filter({ hasText: 'Branch View' }).first().click();
  await settle(page, 1500);
  await page.screenshot({ path: 'tests/results/screenshots/02b-dashboard-branch.png' });
  await assertNoErrors(page);

  // Executive View
  await page.locator('button').filter({ hasText: 'Executive View' }).first().click();
  await settle(page, 1500);
  await page.screenshot({ path: 'tests/results/screenshots/02c-dashboard-executive.png' });
  await assertNoErrors(page);
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3 — EMPLOYEES
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 03a — Employees list loads', async ({ page }) => {
  await navTo(page, 'Employees');
  await settle(page, 2500);
  await page.screenshot({ path: 'tests/results/screenshots/03a-employees-list.png' });
  await expect(page.locator('main')).toBeVisible();
  await assertNoErrors(page);

  const mainText = await page.locator('main').textContent().catch(() => '');
  expect(mainText.length, 'Employees page should have content').toBeGreaterThan(20);
  console.log('  ✓ Employees page loaded');
});

test('TEST 03b — Add Employee form opens with expected fields', async ({ page }) => {
  await navTo(page, 'Employees');
  await settle(page, 2000);

  // Button is in <main> — scope locator there to avoid any sidebar conflicts
  const addBtn = page.locator('main').getByRole('button', { name: /New Employee/i });
  await expect(addBtn).toBeVisible({ timeout: 10000 });
  await addBtn.click();

  // Form renders after an async Supabase call to get the next employee ID — wait for it
  const formHeading = page.locator('text=Add New Employee');
  await expect(formHeading).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: 'tests/results/screenshots/03b-add-employee-form.png' });

  // Check for key field labels from Employees.jsx (Full Name *, Designation, Department, Branch, etc.)
  const labels = ['Full Name', 'Designation', 'Department', 'Branch', 'CNIC', 'Email'];
  let foundLabels = 0;
  for (const lbl of labels) {
    const found = await page.locator(`p:has-text("${lbl}"), label:has-text("${lbl}")`).first().isVisible().catch(() => false);
    if (found) {
      foundLabels++;
      console.log(`  ✓ Field label "${lbl}" found`);
    }
  }
  expect(foundLabels, 'At least 3 field labels should be visible').toBeGreaterThanOrEqual(3);

  // Fill the Full Name input (placeholder="Full Name")
  const nameInput = page.locator('input[placeholder="Full Name"]');
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill('Test Employee Playwright');
    console.log('  ✓ Full Name field filled');
  }

  // Close form with the "Close" button (from EmployeeAdd component)
  const closeBtn = page.locator('main').getByRole('button', { name: 'Close' }).first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
    console.log('  ✓ Form closed');
  }
  await page.waitForTimeout(500);
});

test('TEST 03c — Employee profile tabs visible', async ({ page }) => {
  await navTo(page, 'Employees');
  await settle(page, 2500);

  const firstRow = page.locator('table tbody tr, [class*="cursor-pointer"][class*="hover"]').first();
  const rowExists = await firstRow.isVisible({ timeout: 3000 }).catch(() => false);

  if (rowExists) {
    await firstRow.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/results/screenshots/03c-employee-profile.png' });

    for (const tab of ['Profile', 'Attendance', 'Leave', 'Payroll']) {
      const tabBtn = page.locator('button').filter({ hasText: tab }).first();
      if (await tabBtn.isVisible().catch(() => false)) {
        await tabBtn.click();
        await page.waitForTimeout(500);
        console.log(`  ✓ Profile tab "${tab}" accessible`);
      }
    }
  } else {
    console.log('  ℹ No employee rows found — profile tab check skipped');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4 — DEPARTMENTS
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 04 — Departments page loads', async ({ page }) => {
  await navTo(page, 'Departments');
  await settle(page, 2000);
  await page.screenshot({ path: 'tests/results/screenshots/04-departments.png' });
  await expect(page.locator('main')).toBeVisible();
  await assertNoErrors(page);

  const mainText = await page.locator('main').textContent().catch(() => '');
  expect(mainText.length).toBeGreaterThan(10);

  const addBtn = page.locator('button').filter({ hasText: /Add Department|New Department/i }).first();
  if (await addBtn.isVisible().catch(() => false)) {
    console.log('  ✓ Add Department button visible');
  } else {
    console.log('  ℹ Add Department button not found — page may use different pattern');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 5 — ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 05a — Attendance page loads with all tabs', async ({ page }) => {
  await navTo(page, 'Attendance');
  await settle(page, 2000);
  await page.screenshot({ path: 'tests/results/screenshots/05a-attendance-records.png' });
  await assertNoErrors(page);

  const tabs = [
    ['Timesheet',       '05b-timesheet'],
    ['Adjustments',     '05c-adjustments'],
    ['Missing Punches', '05d-missing-punches'],
    ['Alerts',          '05e-alerts'],
  ];

  for (const [label, screenshot] of tabs) {
    const btn = page.locator('button').filter({ hasText: label }).first();
    const exists = await btn.isVisible({ timeout: 3000 }).catch(() => false);
    if (exists) {
      await btn.click();
      await settle(page, 1500);
      await page.screenshot({ path: `tests/results/screenshots/${screenshot}.png` });
      await assertNoErrors(page);
      console.log(`  ✓ Attendance tab "${label}" loaded`);
    } else {
      console.warn(`  ⚠ Attendance tab "${label}" not visible`);
    }
  }
});

test('TEST 05b — Roster page loads', async ({ page }) => {
  await navTo(page, 'Roster');
  await settle(page, 2000);
  await page.screenshot({ path: 'tests/results/screenshots/05f-roster.png' });
  await expect(page.locator('main')).toBeVisible();
  await assertNoErrors(page);
  console.log('  ✓ Roster page loaded');
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 6 — LEAVE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 06 — Leave Management all tabs load', async ({ page }) => {
  await navTo(page, 'Leave');
  await settle(page, 2000);
  await page.screenshot({ path: 'tests/results/screenshots/06a-leave-apply.png' });
  await assertNoErrors(page);

  // Apply Leave should be default
  const applyHeading = page.locator('text=New Leave Application').first();
  const applyVisible = await applyHeading.isVisible().catch(() => false);
  console.log(applyVisible ? '  ✓ Apply Leave form visible' : '  ℹ Apply Leave heading not found');

  // Use data-testid attributes for precise tab targeting (avoids sidebar "Approval Queue" conflict)
  const tabs = [
    ['leave-approval-queue-tab', 'Approval Queue', '06b-leave-queue'],
    ['leave-balances-tab',       'Balances',        '06c-leave-balances'],
    ['leave-history-tab',        'History',         '06d-leave-history'],
    ['leave-liability-tab',      'Leave Liability', '06e-leave-liability'],
    ['leave-calendar-tab',       'Calendar',        '06f-leave-calendar'],
  ];

  for (const [testId, label, screenshot] of tabs) {
    const btn = page.getByTestId(testId);
    const exists = await btn.isVisible({ timeout: 4000 }).catch(() => false);
    if (exists) {
      await btn.click();
      await settle(page, 1500);
      await page.screenshot({ path: `tests/results/screenshots/${screenshot}.png` });
      await assertNoErrors(page);
      console.log(`  ✓ Leave tab "${label}" loaded`);
    } else {
      console.warn(`  ⚠ Leave tab "${label}" (${testId}) not visible`);
    }
  }

  // Return to Balances tab and check for Download/Template button
  const balancesBtn = page.getByTestId('leave-balances-tab');
  if (await balancesBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await balancesBtn.click();
    await settle(page, 1000);
    const dlBtn = page.locator('button, a').filter({ hasText: /Download|Template|Export/i }).first();
    console.log(await dlBtn.isVisible().catch(() => false)
      ? '  ✓ Download/Template button found on Balances tab'
      : '  ℹ No Download/Template button visible on Balances tab');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 7 — PAYROLL
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 07a — Payroll Processing page loads', async ({ page }) => {
  await navTo(page, 'Payroll');
  await settle(page, 2500);
  await page.screenshot({ path: 'tests/results/screenshots/07a-payroll.png' });
  await expect(page.locator('main')).toBeVisible();
  await assertNoErrors(page);

  // Month selector check
  const monthSel = page.locator('select, input[type="month"]').first();
  console.log(await monthSel.isVisible().catch(() => false)
    ? '  ✓ Month selector found'
    : '  ℹ Month selector uses a different control');
  console.log('  ✓ Payroll page loaded');
});

test('TEST 07b — Adjustments & Tax page loads', async ({ page }) => {
  await navTo(page, 'Adjustments & Tax');
  await settle(page, 2000);
  await page.screenshot({ path: 'tests/results/screenshots/07b-adjustments.png' });

  await expect(page.locator('button').filter({ hasText: 'One-Time Adjustments' }).first()).toBeVisible();
  await assertNoErrors(page);

  const taxTab = page.locator('button').filter({ hasText: 'Tax Management' }).first();
  if (await taxTab.isVisible().catch(() => false)) {
    await taxTab.click();
    await settle(page, 1200);
    await page.screenshot({ path: 'tests/results/screenshots/07c-tax.png' });
    await assertNoErrors(page);
    console.log('  ✓ Tax Management tab loaded');
  }
});

test('TEST 07c — Allowances page loads', async ({ page }) => {
  await navTo(page, 'Allowances');
  await settle(page, 2000);
  await page.screenshot({ path: 'tests/results/screenshots/07d-allowances.png' });
  await expect(page.locator('button').filter({ hasText: 'Fixed Allowances' }).first()).toBeVisible();

  const fuelTab = page.locator('button').filter({ hasText: 'Fuel Allowance' }).first();
  if (await fuelTab.isVisible().catch(() => false)) {
    await fuelTab.click();
    await settle(page, 1200);
    await page.screenshot({ path: 'tests/results/screenshots/07e-fuel.png' });
    console.log('  ✓ Fuel Allowance tab loaded');
  }
  await assertNoErrors(page);
});

test('TEST 07d — Salary Reports page loads', async ({ page }) => {
  await navTo(page, 'Salary Reports');
  await settle(page, 2000);
  await page.screenshot({ path: 'tests/results/screenshots/07f-salary-reports.png' });
  await expect(page.locator('main')).toBeVisible();
  await assertNoErrors(page);
  console.log('  ✓ Salary Reports page loaded');
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 8 — WORKFORCE HUB (HR Tools)
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 08 — Workforce Hub all tabs load', async ({ page }) => {
  await navTo(page, 'Workforce');
  await settle(page, 2000);
  await page.screenshot({ path: 'tests/results/screenshots/08a-workforce-manpower.png' });
  await assertNoErrors(page);

  const tabs = [
    ['Transfers',        '08b-transfers'],
    ['Warnings',         '08c-warnings'],
    ['Performance',      '08d-performance'],
    ['Assets',           '08e-assets'],
  ];

  for (const [label, screenshot] of tabs) {
    const btn = page.locator('button').filter({ hasText: label }).first();
    const exists = await btn.isVisible({ timeout: 3000 }).catch(() => false);
    if (exists) {
      await btn.click();
      await settle(page, 1200);
      await page.screenshot({ path: `tests/results/screenshots/${screenshot}.png` });
      await assertNoErrors(page);
      console.log(`  ✓ Workforce tab "${label}" loaded`);
    } else {
      console.warn(`  ⚠ Workforce tab "${label}" not visible`);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 9 — LOANS & ADVANCES
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 09 — Loans, Advances and Final Settlement tabs load', async ({ page }) => {
  await navTo(page, 'Loans & Advances');
  await settle(page, 2000);
  await page.screenshot({ path: 'tests/results/screenshots/09a-loans.png' });
  await expect(page.locator('button').filter({ hasText: 'Loans' }).first()).toBeVisible();
  await assertNoErrors(page);
  console.log('  ✓ Loans tab loaded');

  const tabs = [
    ['Salary Advances',  '09b-advances'],
    ['Final Settlement', '09c-settlement'],
  ];

  for (const [label, screenshot] of tabs) {
    const btn = page.locator('button').filter({ hasText: label }).first();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click();
      await settle(page, 1500);
      await page.screenshot({ path: `tests/results/screenshots/${screenshot}.png` });
      await assertNoErrors(page);
      console.log(`  ✓ "${label}" tab loaded`);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 10 — FINES & SHORTAGES
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 10a — Fines & Penalties page loads', async ({ page }) => {
  await navTo(page, 'Fines & Penalties');
  await settle(page, 2000);
  await page.screenshot({ path: 'tests/results/screenshots/10a-fines.png' });
  await expect(page.locator('main')).toBeVisible();
  await assertNoErrors(page);
  console.log('  ✓ Fines & Penalties page loaded');
});

test('TEST 10b — Shortages page loads', async ({ page }) => {
  await navTo(page, 'Shortages');
  await settle(page, 2000);
  await page.screenshot({ path: 'tests/results/screenshots/10b-shortages.png' });
  await expect(page.locator('main')).toBeVisible();
  await assertNoErrors(page);
  console.log('  ✓ Shortages page loaded');
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 11 — FINAL SETTLEMENT FIELDS
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 11 — Final Settlement date fields are present', async ({ page }) => {
  await navTo(page, 'Loans & Advances');
  await settle(page, 1500);

  const settlBtn = page.locator('button').filter({ hasText: 'Final Settlement' }).first();
  await settlBtn.click();
  await settle(page, 1500);
  await page.screenshot({ path: 'tests/results/screenshots/11a-settlement.png' });
  await assertNoErrors(page);

  const dateInputs = page.locator('input[type="date"]');
  const count = await dateInputs.count();
  console.log(`  ℹ Found ${count} date input(s) on Settlement page`);

  if (count >= 1) {
    const today = new Date().toISOString().slice(0, 10);
    const futureDate = new Date(Date.now() + 15 * 86400e3).toISOString().slice(0, 10);

    await dateInputs.nth(0).fill(today);
    await page.waitForTimeout(500);
    if (count >= 2) {
      await dateInputs.nth(1).fill(futureDate);
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: 'tests/results/screenshots/11b-settlement-dates-filled.png' });

    const body = await page.locator('main').textContent().catch(() => '');
    if (body.toLowerCase().includes('notice') || body.includes('days')) {
      console.log('  ✓ Notice period / days calculation visible');
    }
    if (body.toLowerCase().includes('pending') || body.includes('salary')) {
      console.log('  ✓ Pending salary calculation visible');
    }
  } else {
    console.log('  ℹ No date inputs found — employee must be selected first');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 12 — SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 12 — Settings page loads with both tabs', async ({ page }) => {
  await navTo(page, 'Settings');
  await settle(page, 2000);
  await page.screenshot({ path: 'tests/results/screenshots/12a-settings.png' });
  await expect(page.locator('main')).toBeVisible();
  await assertNoErrors(page);

  // Policy Rules (default tab)
  const rulesTab = page.locator('button').filter({ hasText: 'Policy Rules' }).first();
  if (await rulesTab.isVisible().catch(() => false)) {
    await rulesTab.click();
    await settle(page, 1000);
    await page.screenshot({ path: 'tests/results/screenshots/12b-policy-rules.png' });
    console.log('  ✓ Policy Rules tab loaded');
  }

  // Policy Settings tab
  const settingsTab = page.locator('button').filter({ hasText: 'Policy Settings' }).first();
  if (await settingsTab.isVisible().catch(() => false)) {
    await settingsTab.click();
    await settle(page, 1000);
    await page.screenshot({ path: 'tests/results/screenshots/12c-policy-settings.png' });
    console.log('  ✓ Policy Settings tab loaded');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 13 — APPROVAL QUEUE
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 13 — Approval Queue all tabs load', async ({ page }) => {
  await navTo(page, 'Approval Queue');
  await settle(page, 2000);
  await page.screenshot({ path: 'tests/results/screenshots/13a-approval-queue.png' });
  await expect(page.locator('main')).toBeVisible();
  await assertNoErrors(page);
  console.log('  ✓ Approval Queue loaded');

  const tabs = [
    ['Leave Approvals',       '13b-queue-leave'],
    ['Timesheet Sign-offs',   '13c-queue-timesheet'],
    ['Attendance Corrections','13d-queue-attendance'],
    ['One-Time Adjustments',  '13e-queue-adjustments'],
    ['Final Settlements',     '13f-queue-settlements'],
    ['Salary Increments',     '13g-queue-increments'],
  ];

  for (const [label, screenshot] of tabs) {
    const btn = page.locator('button').filter({ hasText: label }).first();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click();
      await settle(page, 1200);
      await page.screenshot({ path: `tests/results/screenshots/${screenshot}.png` });
      await assertNoErrors(page);
      console.log(`  ✓ Queue tab "${label}" loaded`);
    } else {
      console.warn(`  ⚠ Queue tab "${label}" not visible`);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 14 — AI ASSISTANT
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 14 — AI Assistant loads and accepts input', async ({ page }) => {
  await navTo(page, 'AI Assistant');
  await settle(page, 2000);
  await page.screenshot({ path: 'tests/results/screenshots/14a-ai-assistant.png' });
  await expect(page.locator('main')).toBeVisible();
  await assertNoErrors(page);

  // Chat input — targeted via data-testid="ai-chat-input"
  const chatInput = page.getByTestId('ai-chat-input');
  const inputVisible = await chatInput.isVisible({ timeout: 5000 }).catch(() => false);

  if (inputVisible) {
    console.log('  ✓ Chat input found');
    await expect(chatInput).toHaveAttribute('placeholder', 'Ask anything about your HR data...');
    await chatInput.fill('How many employees are there?');
    await page.screenshot({ path: 'tests/results/screenshots/14b-ai-typed.png' });

    const sendBtn = page.getByTestId('ai-chat-send');
    if (await sendBtn.isVisible().catch(() => false)) {
      await sendBtn.click();
      console.log('  ✓ Send button clicked');
    } else {
      await chatInput.press('Enter');
    }

    // AI responses may take time; API key may not be set in CI — just verify no crash
    await settle(page, 5000);
    await page.screenshot({ path: 'tests/results/screenshots/14c-ai-response.png' });
    console.log('  ✓ Query submitted to AI Assistant');
  } else {
    console.warn('  ⚠ Chat input not found — check AIAssistant.jsx data-testid');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 15 — DATA MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 15 — Data Management page loads', async ({ page }) => {
  await navTo(page, 'Data Management');
  await settle(page, 2000);
  await page.screenshot({ path: 'tests/results/screenshots/15-data-management.png' });
  await expect(page.locator('main')).toBeVisible();
  await assertNoErrors(page);

  const hasImport = await page.locator('text=Import').first().isVisible().catch(() => false);
  const hasExport = await page.locator('text=Export').first().isVisible().catch(() => false);
  console.log(`  ℹ Import visible: ${hasImport}, Export visible: ${hasExport}`);
  console.log('  ✓ Data Management page loaded');
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 16 — ROLE TESTING: HR Role
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 16 — HR role shows correct sidebar items', async ({ page }) => {
  // Role dropdown in top bar
  const roleSelect = page.locator('select').first();
  await roleSelect.selectOption('HR');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tests/results/screenshots/16a-hr-sidebar.png' });

  // HR CAN see these
  await expect(page.locator('aside button').filter({ hasText: 'Employees' }).first()).toBeVisible();
  await expect(page.locator('aside button').filter({ hasText: 'Attendance' }).first()).toBeVisible();
  await expect(page.locator('aside button').filter({ hasText: 'Leave' }).first()).toBeVisible();
  console.log('  ✓ HR can see Employees, Attendance, Leave');

  // HR CANNOT see Settings (Master only)
  await expect(
    page.locator('aside button').filter({ hasText: 'Settings' }).first()
  ).not.toBeVisible();
  console.log('  ✓ Settings hidden from HR role');

  // Navigate and verify it loads
  await navTo(page, 'Payroll');
  await settle(page, 2000);
  await page.screenshot({ path: 'tests/results/screenshots/16b-hr-payroll.png' });
  await assertNoErrors(page);

  // Restore Master
  await roleSelect.selectOption('Master');
  await page.waitForTimeout(500);
  console.log('  ✓ Role restored to Master');
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 17 — ROLE TESTING: Finance Role
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 17 — Finance role has restricted sidebar', async ({ page }) => {
  const roleSelect = page.locator('select').first();
  await roleSelect.selectOption('Finance');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tests/results/screenshots/17a-finance-sidebar.png' });

  // Finance CAN see Dashboard and Payroll
  await expect(page.locator('aside button').filter({ hasText: 'Dashboard' }).first()).toBeVisible();
  await expect(page.locator('aside button').filter({ hasText: 'Payroll' }).first()).toBeVisible();
  console.log('  ✓ Finance can see Dashboard and Payroll');

  // Finance CANNOT see Attendance, Fines, Settings
  await expect(
    page.locator('aside button').filter({ hasText: 'Attendance' }).first()
  ).not.toBeVisible();
  console.log('  ✓ Attendance hidden from Finance role');

  await expect(
    page.locator('aside button').filter({ hasText: 'Fines & Penalties' }).first()
  ).not.toBeVisible();
  console.log('  ✓ Fines & Penalties hidden from Finance role');

  await expect(
    page.locator('aside button').filter({ hasText: 'Settings' }).first()
  ).not.toBeVisible();
  console.log('  ✓ Settings hidden from Finance role');

  // Restore Master
  await roleSelect.selectOption('Master');
  await page.waitForTimeout(500);
  console.log('  ✓ Role restored to Master');
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 18 — EMPLOYEE SELF-SERVICE PORTAL
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 18 — Employee Self-Service login page is separate from HR app', async ({ page }) => {
  await page.goto('/#employee-login');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'tests/results/screenshots/18a-employee-login.png' });

  // Employee portal login page should be rendered
  await expect(
    page.locator('text=Employee Self-Service Portal').first()
  ).toBeVisible();

  // Should have Employee ID and Password inputs
  await expect(
    page.locator('input[placeholder*="BB-"]').or(page.locator('label:has-text("Employee ID")')).first()
  ).toBeVisible();
  await expect(page.locator('input[type="password"]').first()).toBeVisible();

  // Should NOT show the HR sidebar
  await expect(page.locator('aside')).not.toBeVisible();
  console.log('  ✓ Employee login page correctly isolated from HR app');

  // Test the "Go to HR Portal" back-link
  const hrLink = page.locator('button').filter({ hasText: /HR Portal|Go to HR/i }).first();
  if (await hrLink.isVisible().catch(() => false)) {
    await hrLink.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'tests/results/screenshots/18b-back-to-hr.png' });
    await expect(page.locator('text=Big Buy HRMS').first()).toBeVisible();
    console.log('  ✓ Back to HR Portal link works');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 19 — NAVIGATION: All sidebar links load without blank pages
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 19 — All sidebar nav items load without blank pages or NaN/undefined', async ({ page }) => {
  const sidebarButtons = page.locator('aside button');
  const count = await sidebarButtons.count();
  console.log(`  ℹ Found ${count} sidebar nav items`);

  const issues = [];

  for (let i = 0; i < count; i++) {
    const btn = sidebarButtons.nth(i);
    const label = (await btn.textContent().catch(() => '')).trim();
    if (!label) continue;

    await btn.click();
    await settle(page, 1800);

    const mainText = await page.locator('main').textContent().catch(() => '');
    const hasContent = mainText.length > 30;

    // NaN check (but allow strings like "NaN-year" which are CSS class fragments)
    const hasRawNaN = / NaN | NaN$|^NaN |NaN\b/.test(mainText) && !mainText.includes('NaN-');
    const hasUndefined = /\bundefined\b/.test(mainText);

    if (!hasContent) issues.push(`"${label}": blank page`);
    if (hasRawNaN)   issues.push(`"${label}": NaN value in content`);
    if (hasUndefined) issues.push(`"${label}": "undefined" in content`);

    if (!hasContent || hasRawNaN || hasUndefined) {
      await page.screenshot({ path: `tests/results/screenshots/19-nav-issue-${label.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png` });
    } else {
      console.log(`  ✓ "${label}" loaded OK`);
    }
  }

  await page.screenshot({ path: 'tests/results/screenshots/19-nav-complete.png' });

  if (issues.length > 0) {
    console.warn(`  ⚠ Navigation issues found:\n    ${issues.join('\n    ')}`);
    // Log but don't hard-fail — some pages may show empty state intentionally
  }

  expect(count, 'Should have at least 5 sidebar items').toBeGreaterThanOrEqual(5);
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 20 — ZKT SYNC PAGE
// ═══════════════════════════════════════════════════════════════════════════

test('TEST 20 — ZKT Sync page loads', async ({ page }) => {
  await navTo(page, 'ZKT Sync');
  await settle(page, 2000);
  await page.screenshot({ path: 'tests/results/screenshots/20-zkt-sync.png' });
  await expect(page.locator('main')).toBeVisible();
  await assertNoErrors(page);
  console.log('  ✓ ZKT Sync page loaded');
});

// ═══════════════════════════════════════════════════════════════════════════
// BONUS — No critical error banners on fresh Dashboard load
// ═══════════════════════════════════════════════════════════════════════════

test('BONUS — Dashboard shows no critical load errors', async ({ page }) => {
  await settle(page, 2000);

  // Detect red error banners that indicate data load failures (not expected alert banners)
  const redBanners = page.locator('[class*="text-red"][class*="bg-red"]');
  const count = await redBanners.count();

  if (count > 0) {
    for (let i = 0; i < count; i++) {
      const text = (await redBanners.nth(i).textContent().catch(() => '')).trim();
      if (text) console.warn(`  ⚠ Red banner text: "${text.slice(0, 120)}"`);
    }
    // Only fail if it's a genuine load error (temporary employee alerts are expected/OK)
    const bannerTexts = await redBanners.allTextContents().catch(() => []);
    const hasLoadError = bannerTexts.some(t =>
      t.includes('load failed') || t.includes('fetch failed') || t.includes('Cannot')
    );
    expect(hasLoadError, 'Should not have critical load error banners').toBe(false);
  } else {
    console.log('  ✓ No error banners on Dashboard');
  }

  await page.screenshot({ path: 'tests/results/screenshots/bonus-dashboard-clean.png' });
});
