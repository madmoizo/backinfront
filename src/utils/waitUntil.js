/**
 * Wait for something
 * @param {function} resolveCondition
 * @param {object} options
 * @param {number} [options.timeout=30000] -in ms
 * @param {number} [options.interval=50] - in ms
 * @param {string} [options.rejectMessage]
 * @param {function} [options.onReject]
 */
export default function waitUntil (resolveCondition, { timeout, interval, rejectMessage, onReject }) {
  timeout ??= 30000
  interval ??= 50
  rejectMessage ??= 'waitUntil: timeout'

  return new Promise((resolve, reject) => {
    // Resolve immediately if the condition is already verified
    if (resolveCondition()) {
      resolve(true)
    // Async resolve
    } else {
      const timeoutHandler = setTimeout(() => {
        clearInterval(intervalHandler)
        if (onReject) {
          onReject()
        }
        reject(new Error(rejectMessage))
      }, timeout)

      const intervalHandler = setInterval(() => {
        if (resolveCondition()) {
          clearTimeout(timeoutHandler)
          clearInterval(intervalHandler)
          resolve(true)
        }
      }, interval)
    }
  })
}
