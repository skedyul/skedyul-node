declare module 'node:test' {
  export interface TestContext {
    // You can extend this as needed for more advanced tests
    name: string
    // Minimal placeholder for Node's TestContext methods
    runOnly?: boolean
  }

  export function test(
    name: string,
    fn: (t: TestContext) => void | Promise<void>,
  ): void

  export { test as default }
}

declare module 'node:assert/strict' {
  import assert = require('assert')
  export = assert
}


