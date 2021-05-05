import getUrlPath from './getUrlPath.js'


/**
 * Convert url string to regexp
 * @param {String} urlString
 */
export default function urlToRegexp (urlString) {
  const url = new URL(urlString)

  let regexpString = `^${getUrlPath(url)}$`
  const tags = url.pathname.match(/:[^/]+/g) || []
  const pathParams = tags.map(tag => {
    regexpString = regexpString.replace(tag, '([a-zA-Z0-9-]+)')
    return tag.replace(':', '')
  })
  const regexp = new RegExp(regexpString)

  return {
    url,
    pathParams,
    regexp
  }
}
