/**
 * Generate a UUID v4
 * https://stackoverflow.com/a/2117523/4906701
 * Native browser API in progress
 * https://github.com/WICG/uuid/blob/gh-pages/explainer.md
 * Should be as easy as crypto.randomUUID()
 * @return {string}
 */
export default function generateUUID () {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16))
}
