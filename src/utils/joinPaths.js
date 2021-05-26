/**
 * Join pathnames
 * @param {...string} paths
 * @return {string}
 */
export default function joinPaths (...paths) {
  let fullpath = paths
    .filter(path => path)
    .join('/')

  // Remove duplicate slashs
  // https://regex101.com/r/NhCVMz/3
  fullpath = fullpath.replace(/(https?:\/\/)|(\/){2,}/g, '$1$2')
  // remove leading slash
  if (fullpath.startsWith('/')) {
    fullpath = fullpath.substring(1)
  }
  // remove trailing slash
  if (fullpath.endsWith('/')) {
    fullpath = fullpath.substring(0, fullpath.length - 1)
  }

  return fullpath
}
