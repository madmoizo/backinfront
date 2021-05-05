/**
 * Get URL clean path
 * @param {URL} url
 */
export default function getUrlPath (url) {
  return `${url.origin}${url.pathname}`
}
