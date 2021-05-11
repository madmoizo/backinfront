/**
 * Wait for something
 */
export default function waitUntil (resolveCondition, rejectMessage, onReject) {
  const delay = 20 // secondes

  return new Promise((resolve, reject) => {
    // Resolve immediately if the condition is already verified
    if (resolveCondition()) {
      resolve(true)
    // Async resolve
    } else {
      const timeout = setTimeout(() => {
        clearInterval(interval)
        if (onReject) {
          onReject()
        }
        reject(new Error(rejectMessage))
      }, delay * 1000)

      const interval = setInterval(() => {
        if (resolveCondition()) {
          clearTimeout(timeout)
          clearInterval(interval)
          resolve(true)
        }
      }, 50)
    }
  })
}
