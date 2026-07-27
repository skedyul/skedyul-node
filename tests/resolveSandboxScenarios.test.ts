import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LEGACY_DEFAULT_SANDBOX_SCENARIO_ID,
  listSandboxScenarios,
  listSandboxScenariosWithContext,
  resolveDefaultSandboxScenarioId,
  resolveSandboxScenarioContext,
} from '../src/context/resolveSandboxScenarios'
import type { SandboxConfig } from '../src/context/types'

const senderA = {
  kind: 'contact' as const,
  displayName: 'Alice',
}

const senderB = {
  kind: 'contact' as const,
  displayName: 'Bob',
}

test('listSandboxScenarios normalizes legacy mockContext to default', () => {
  const sandbox: SandboxConfig = {
    enabled: true,
    mockContext: { sender: senderA },
  }
  assert.deepEqual(listSandboxScenarios(sandbox), [
    { id: LEGACY_DEFAULT_SANDBOX_SCENARIO_ID, label: 'Default' },
  ])
})

test('listSandboxScenarios returns named scenarios with labels', () => {
  const sandbox: SandboxConfig = {
    scenarios: {
      new_lead: { label: 'New lead', context: { sender: senderA } },
      qualified: { context: { sender: senderB } },
    },
  }
  assert.deepEqual(listSandboxScenarios(sandbox), [
    { id: 'new_lead', label: 'New lead' },
    { id: 'qualified', label: 'qualified' },
  ])
})

test('resolveDefaultSandboxScenarioId prefers defaultScenario when valid', () => {
  const sandbox: SandboxConfig = {
    defaultScenario: 'qualified',
    scenarios: {
      new_lead: { context: { sender: senderA } },
      qualified: { context: { sender: senderB } },
    },
  }
  assert.equal(resolveDefaultSandboxScenarioId(sandbox), 'qualified')
})

test('resolveDefaultSandboxScenarioId ignores invalid defaultScenario', () => {
  const sandbox: SandboxConfig = {
    defaultScenario: 'missing',
    scenarios: {
      new_lead: { context: { sender: senderA } },
    },
  }
  assert.equal(resolveDefaultSandboxScenarioId(sandbox), 'new_lead')
})

test('resolveSandboxScenarioContext selects scenario by id', () => {
  const sandbox: SandboxConfig = {
    mockContext: { sender: { kind: 'contact', displayName: 'Legacy' } },
    scenarios: {
      new_lead: { context: { sender: senderA } },
      qualified: { context: { sender: senderB } },
    },
  }
  assert.deepEqual(resolveSandboxScenarioContext(sandbox, 'qualified'), {
    sender: senderB,
  })
  assert.deepEqual(
    resolveSandboxScenarioContext(sandbox, null),
    resolveSandboxScenarioContext(sandbox, 'new_lead'),
  )
})

test('resolveSandboxScenarioContext uses legacy when no scenarios map', () => {
  const sandbox: SandboxConfig = {
    context: { sender: senderA },
  }
  assert.deepEqual(resolveSandboxScenarioContext(sandbox, 'any'), {
    sender: senderA,
  })
})

test('listSandboxScenariosWithContext includes context payloads', () => {
  const sandbox: SandboxConfig = {
    scenarios: {
      a: { context: { sender: senderA } },
    },
  }
  const list = listSandboxScenariosWithContext(sandbox)
  assert.equal(list.length, 1)
  assert.equal(list[0]?.id, 'a')
  assert.deepEqual(list[0]?.context, { sender: senderA })
})
