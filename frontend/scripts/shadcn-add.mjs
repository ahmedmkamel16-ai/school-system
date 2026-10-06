#!/usr/bin/env node
// Wrapper around `shadcn add` that works around a CLI bug on this setup:
// it sometimes writes generated files under a literal "./@" directory
// instead of resolving the "@/*" tsconfig alias to "./src". This script
// runs the real CLI, then relocates anything left in "./@" into "./src".
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)

const result = spawnSync('npx', ['shadcn@latest', 'add', ...args, '--yes'], {
  stdio: 'inherit',
  shell: true,
})

const bogusDir = join(process.cwd(), '@')

function moveRecursive(src, dest) {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name)
    const to = join(dest, entry.name)
    if (entry.isDirectory()) {
      moveRecursive(from, to)
    } else {
      renameSync(from, to)
    }
  }
}

if (existsSync(bogusDir)) {
  console.log(
    '\n[shadcn-add] Known CLI quirk detected: files landed in "./@" instead of "./src". Relocating...',
  )
  moveRecursive(bogusDir, join(process.cwd(), 'src'))
  rmSync(bogusDir, { recursive: true, force: true })
  console.log('[shadcn-add] Done — files are now under src/.')
}

process.exit(result.status ?? 0)
