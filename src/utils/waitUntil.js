/**
 * Wait for something
 */
export default function waitUntil (resolveCondition, { timeout, interval, rejectMessage, onReject }) {
  timeout = timeout || 30000
  interval = interval || 50
  rejectMessage = rejectMessage || 'waitUntil: timeout'

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
