export function cleanUrl(url: string): string {
  try {
    const urlObj = new URL(url)

    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`
  } catch {
    return url
  }
}

export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url)

    return urlObj.hostname
  } catch {
    return 'unknown'
  }
}