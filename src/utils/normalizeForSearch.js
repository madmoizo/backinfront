/**
 * Normalize a string (unaccent & lowercase)
 * @param {string} str
 * @return {string}
 */
export default function normalizeForSearch (str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}
