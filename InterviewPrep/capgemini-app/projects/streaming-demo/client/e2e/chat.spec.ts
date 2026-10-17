import { expect, test, type Page } from '@playwright/test';

async function startRun(page: Page) {
  await page.goto('/');
  await page.getByLabel('Ask the agent').fill('Order replacement parts for the open network tickets');
  await page.getByRole('button', { name: 'Start run' }).click();
  // Web-first assertions retry until the streamed text arrives: no sleeps, no flakiness.
  await expect(page.getByText("I'll look up the open tickets for this vendor")).toBeVisible();
  const approval = page.getByRole('region', { name: /approval needed/i });
  await expect(approval).toBeVisible();
  await expect(page.getByTestId('ws-status')).toHaveText('ready');
  return approval;
}

test('streams a run, pauses for approval, and finishes after approving', async ({ page }) => {
  const approval = await startRun(page);
  await expect(page.getByTestId('run-status')).toHaveText('awaiting_approval');
  await approval.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(/created purchase order PO-1001/)).toBeVisible();
  await expect(page.getByTestId('run-status')).toHaveText('completed');
  await expect(page.getByRole('status')).toHaveText('Run completed');
  await expect(page.getByTestId('ws-status')).toHaveText('idle'); // the control socket closes when the run ends
});

test('a reload mid-run replays the event log and the run carries on', async ({ page }) => {
  await startRun(page);
  await page.reload();
  // Everything streamed before the reload comes back from the server's log, and the approval is still pending.
  await expect(page.getByText("I'll look up the open tickets for this vendor")).toBeVisible();
  const approval = page.getByRole('region', { name: /approval needed/i });
  await expect(page.getByTestId('ws-status')).toHaveText('ready');
  await approval.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText(/did not create the purchase order/)).toBeVisible();
  await expect(page.getByTestId('run-status')).toHaveText('completed');
});

test('Stop cancels the run over the control socket', async ({ page }) => {
  await startRun(page);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByTestId('run-status')).toHaveText('cancelled');
  await expect(page.getByText('Stopped: cancelled by user')).toBeVisible();
});
