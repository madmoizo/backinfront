/**
 * Get URL clean path
 * @param {URL} url
 * @return {string}
 */
export default function getUrlPath (url) {
  return `${url.origin}${url.pathname}`
}
