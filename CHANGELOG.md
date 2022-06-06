# 4.0.0

- breaking(Store): Rename `delete` to `deleteOne`
- feat(Store): add `deleteMany` method

# 3.0.0

- breaking(Store): Rename `destroy` to `delete`
- feature(Backinfront): add new options `collectionDataKey` (default: `rows`) and `collectionCountKey` (default: `count`)

# 2.0.0

- breaking(Router): Remove `storeName`
- breaking(Route): Rename `action` to `handler`
- breaking(Backinfront): Rename `authToken` to `authentication`. This property now accepts `false` as a value
- feature(Router): add a new type of route `{ storeName: string, presets: Array<'create' | 'list' | 'retrieve' | 'update'> }`

# 1.0.0

Happy first release
