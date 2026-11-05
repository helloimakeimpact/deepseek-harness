/** Keyless assembled-app acceptance for the explicitly selected Indus Orbit build. */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { describe, expect, it, onTestFinished } from 'vitest'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

describe.skipIf(process.env.DSH_CLIENT_BUILD_PROFILE !== 'indus-orbit')('Indus Orbit Workstation identity', () => {
  it('shows the approved identity and a static loaded mark on desktop and a narrow phone', async () => {
    const scaffold = await launchWebScaffold({})
    onTestFinished(() => scaffold.close())
    const browser = await chromium.launch()
    onTestFinished(() => browser.close())
    const page = await newEnglishPage(browser)
    const tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    const headline = page.getByText('Intelligence, built together.', { exact: true })
    await headline.waitFor({ timeout: 30_000 })
    expect(await page.title()).toContain('I/O Harness — Indus Orbit')
    expect(await page.getByText('Preview', { exact: true }).isVisible()).toBe(true)
    const expand = page.getByRole('button', { name: 'Open sidebar', exact: true })
    if (await expand.isVisible()) await expand.click()
    expect(await page.getByLabel('I/O Harness', { exact: true }).isVisible()).toBe(true)
    expect(await page.getByText('Indus Orbit', { exact: true }).isVisible()).toBe(true)
    const mark = page.locator('img[width="34"][height="34"]')
    await expect.poll(() => mark.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 512)).toBe(true)
    await mark.hover()
    expect(await mark.evaluate(image => getComputedStyle(image).animationName)).toBe('none')
    expect(await headline.locator('xpath=..').ariaSnapshot()).toMatchSnapshot('hero-copy')
    const evidence = process.env.INDUS_WORKSTATION_EVIDENCE_DIR
    if (evidence !== undefined) {
      await mkdir(evidence, { recursive: true })
      await page.screenshot({ path: join(evidence, 'workstation-desktop.png'), fullPage: true })
    }
    await page.setViewportSize({ width: 375, height: 812 })
    await headline.waitFor()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    expect(await mark.isVisible()).toBe(true)
    if (evidence !== undefined) await page.screenshot({ path: join(evidence, 'workstation-mobile.png'), fullPage: true })
    expect(tripwire.pageErrors).toEqual([])
  }, 180_000)
})
