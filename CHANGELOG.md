# 2.0.0

- Rename `Route`'s property `action` to `handler`
- Remove `Router`'s property `storeName` and add a new type of route `{ storeName: string, presets: Array<create|list|retrieve|update> }`

# 1.2.0

- Rename `authToken` into `authentication` which can be `false` or a `function` returning a JWT

# 1.0.0

Happy first release