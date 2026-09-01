export function sanitizeFileUrl(url: string, apiBaseUrl = ''): string {
  if (!url) return ''

  if (url.startsWith('/') && !url.startsWith('//')) {
    const base = apiBaseUrl.replace(/\/+$/, '')
    return base ? `${base}${url}` : url
  }

  try {
    const parsed = new URL(url)
    if (
      parsed.protocol === 'blob:' ||
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:'
    ) {
      return url
    }
  } catch {
    /* invalid URL */
  }

  return ''
}

export function proxiedFileUrl(url: string, apiBaseUrl = ''): string {
  if (url.startsWith('/') && !url.startsWith('//')) return url

  const resolvedUrl = sanitizeFileUrl(url, apiBaseUrl)
  if (!resolvedUrl) return ''

  try {
    const parsedUrl = new URL(resolvedUrl)
    if (parsedUrl.pathname.startsWith('/api/') || parsedUrl.pathname.startsWith('/assets/')) {
      return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`
    }
  } catch {
    return resolvedUrl
  }

  return resolvedUrl
}
