export default class CustomError extends Error {
  constructor (message) {
    super(`[Backinfront] ${message}`)
  }
}
