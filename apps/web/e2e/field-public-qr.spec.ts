import { expect, test } from '@playwright/test'

test('a newly created field gets one stable QR for its read-only queue', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'צור מגרש חדש' }).click()
  await page.getByRole('textbox', { name: 'שם המגרש' }).fill('מגרש QR בדיקה')
  await page.getByRole('button', { name: 'צור מגרש', exact: true }).click()

  await expect(page).toHaveURL(/\/f\/[a-z2-9]{6}$/)
  const slug = new URL(page.url()).pathname.split('/').at(-1)
  if (slug === undefined) throw new Error('created field URL has no slug')
  const publicUrl = `https://line.maple-group.info/line/${slug}`

  const qrButton = page.getByRole('button', { name: 'קוד QR לתצוגת השחקנים' })
  const shareButton = page.getByRole('button', { name: 'שיתוף קישור לתור' })
  for (const control of [qrButton, shareButton]) {
    const box = await control.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(44)
    expect(box?.height).toBeGreaterThanOrEqual(44)
  }

  await qrButton.click()
  await expect(page.getByRole('dialog', { name: 'קוד QR לתצוגת השחקנים' })).toBeVisible()
  await expect(page.getByTestId('public-view-qr')).toHaveAttribute('data-qr-value', publicUrl)
  await expect(page.getByText(publicUrl, { exact: true })).toBeVisible()

  await page.goto(`/line/${slug}`)
  await expect(page.getByRole('heading', { name: 'התור במגרש' })).toBeVisible()
  await expect(page.getByText('מגרש QR בדיקה')).toBeVisible()
  await expect(page.getByText('צפייה בלבד')).toBeVisible()
  await expect(page.getByText('אין שחקנים בתור כרגע')).toBeVisible()
  await expect(page.getByRole('button', { name: /התחל/ })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
