import { beforeEach, describe, expect, it } from 'vitest'
import { applyPwaIdentity, getPwaIdentity } from './pwaIdentity'

describe('getPwaIdentity', () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <link rel="icon" href="/icons/manager-icon-32.png" data-pwa-favicon />
      <link rel="apple-touch-icon" href="/icons/manager-icon-192.png" />
      <meta name="apple-mobile-web-app-title" content="ניהול מגרשים" />
    `
  })

  it('uses a distinct manager manifest, icon, and title on the manager origin', () => {
    expect(getPwaIdentity('gate.netanya.club', '/f/abc234')).toEqual({
      manifestHref: '/manifest-manager.webmanifest',
      faviconHref: '/icons/manager-icon-32.png',
      appleTouchIconHref: '/icons/manager-icon-192.png',
      title: 'ניהול מגרשים',
    })
  })

  it('preserves the line identity on both its production origin and local /line route', () => {
    const expected = {
      manifestHref: '/manifest-line.webmanifest',
      faviconHref: '/favicon-32.png',
      appleTouchIconHref: '/apple-touch-icon.png',
      title: 'התור במגרש',
    }

    expect(getPwaIdentity('line.maple-group.info', '/')).toEqual(expected)
    expect(getPwaIdentity('localhost', '/line')).toEqual(expected)
  })

  it('applies one host-specific manifest link and safely updates it on repeat calls', () => {
    applyPwaIdentity('gate.netanya.club', '/')
    applyPwaIdentity('line.maple-group.info', '/')

    expect(document.querySelectorAll('link[rel="manifest"]')).toHaveLength(1)
    expect(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.getAttribute('href')).toBe(
      '/manifest-line.webmanifest',
    )
    expect(document.querySelector<HTMLLinkElement>('link[data-pwa-favicon]')?.getAttribute('href')).toBe(
      '/favicon-32.png',
    )
    expect(document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.getAttribute('href')).toBe(
      '/apple-touch-icon.png',
    )
    expect(document.title).toBe('התור במגרש')
  })
})
