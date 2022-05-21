export default class BackinfrontError extends Error {
  constructor (message) {
    super(`[Backinfront] ${message}`)
    this.name = this.constructor.name
  }
}
