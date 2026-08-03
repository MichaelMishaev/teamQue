import { expect, test } from '@playwright/test'

test('creates a protected demo field and requires its password before entry', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'צור מגרש חדש' }).click()
  await page.getByLabel('שם המגרש').fill('מגרש מוגן')
  await page.getByLabel('סיסמה בת 4 ספרות (לא חובה)').fill('4829')
  await page.getByRole('button', { name: 'צור מגרש', exact: true }).click()

  await expect(page).toHaveURL(/\/f\/[a-z2-9]{6}$/)
  await expect(page.getByRole('heading', { name: 'מגרש מוגן' })).toBeVisible()

  const backToFields = page.getByRole('link', { name: 'כל המגרשים' })
  await expect(backToFields).toHaveAttribute('href', '/')
  await backToFields.click()
  await expect(page).toHaveURL(/\/$/)
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'מגרש מוגן' })).toBeVisible()

  await page.getByLabel('סיסמה בת 4 ספרות').fill('0000')
  await page.getByRole('button', { name: 'כניסה למגרש' }).click()
  await expect(page.getByRole('alert')).toContainText('הסיסמה שגויה')

  await page.getByLabel('סיסמה בת 4 ספרות').fill('4829')
  await page.getByRole('button', { name: 'כניסה למגרש' }).click()
  const appHeader = page.getByRole('navigation', { name: 'ניווט במגרש' }).locator('xpath=ancestor::header')
  await expect(appHeader.getByRole('heading', { name: 'מגרש מוגן' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'התור (0)' })).toBeVisible()

  await page.goto('/f/demo23')
  await expect(page.getByRole('heading', { name: 'התור (5)' })).toBeVisible()
})
