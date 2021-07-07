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

  // Resolve immediately if the condition is already fullfiled
  if (resolveCondition()) {
    return Promise.resolve()
  }

  // Or wait until it happens
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      clearInterval(intervalId)
      onReject?.()
      reject(new Error(rejectMessage))
    }, timeout)

    const intervalId = setInterval(() => {
      if (resolveCondition()) {
        clearTimeout(timeoutId)
        clearInterval(intervalId)
        resolve()
      }
    }, interval)
  })
}
