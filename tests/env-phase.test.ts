import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveInstallPhase,
  splitProvisionEnvSchema,
} from '../src/config/env-phase'

test('resolveInstallPhase uses explicit installPhase when set', () => {
  assert.equal(
    resolveInstallPhase({
      scope: 'install',
      installPhase: 'post_install',
    }),
    'post_install',
  )
})

test('resolveInstallPhase defaults legacy optional install vars to post_install', () => {
  assert.equal(
    resolveInstallPhase({
      scope: 'install',
      required: false,
    }),
    'post_install',
  )
})

test('resolveInstallPhase defaults legacy required install vars to pre_install', () => {
  assert.equal(
    resolveInstallPhase({
      scope: 'install',
      required: true,
    }),
    'pre_install',
  )
})

test('splitProvisionEnvSchema splits provision and install phases', () => {
  const split = splitProvisionEnvSchema({
    CLIENT_ID: {
      label: 'Client ID',
      scope: 'provision',
    },
    USERNAME: {
      label: 'Username',
      scope: 'install',
      installPhase: 'pre_install',
      required: true,
    },
    REFRESH_TOKEN: {
      label: 'Refresh Token',
      scope: 'install',
      installPhase: 'post_install',
    },
  })

  assert.deepEqual(Object.keys(split.global), ['CLIENT_ID'])
  assert.deepEqual(Object.keys(split.preInstall), ['USERNAME'])
  assert.deepEqual(Object.keys(split.postInstall), ['REFRESH_TOKEN'])
})
