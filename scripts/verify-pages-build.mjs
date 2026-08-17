import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import process from 'node:process'
import { URL, fileURLToPath } from 'node:url'

const expectedBase = process.argv[2] ?? '/'
const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const indexPath = resolve(distDir, 'index.html')

const fail = (message) => {
  process.stderr.write(`Pages build verification failed: ${message}\n`)
  process.exit(1)
}

if (!expectedBase.startsWith('/') || !expectedBase.endsWith('/') || expectedBase.includes('//') || /[?#]/.test(expectedBase)) {
  fail(`base path must start and end with one slash: ${expectedBase}`)
}

if (!existsSync(indexPath) || !statSync(indexPath).isFile()) {
  fail('dist/index.html does not exist')
}

const indexHtml = readFileSync(indexPath, 'utf8')
const references = [...indexHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)].map((match) => match[1])
const localReferences = references.filter((reference) => !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference))

if (localReferences.length === 0) {
  fail('dist/index.html has no local asset references')
}

const verifiedFiles = new Map()

const verifyReference = (reference, source) => {
  const pathname = new URL(reference, `https://pages.invalid${expectedBase}`).pathname
  if (!pathname.startsWith(expectedBase)) {
    fail(`${source} references ${pathname}, outside expected base ${expectedBase}`)
  }

  let decodedPath
  try {
    decodedPath = decodeURIComponent(pathname.slice(expectedBase.length))
  } catch {
    fail(`${source} contains an invalid encoded path: ${pathname}`)
  }

  if (!decodedPath) {
    fail(`${source} contains an empty local reference`)
  }

  const targetPath = resolve(distDir, decodedPath)
  const relativeTarget = relative(distDir, targetPath)
  if (!relativeTarget || relativeTarget.startsWith('..') || isAbsolute(relativeTarget)) {
    fail(`${source} escapes dist: ${pathname}`)
  }
  if (!existsSync(targetPath) || !statSync(targetPath).isFile()) {
    fail(`${source} references a missing file: ${pathname}`)
  }

  verifiedFiles.set(pathname, targetPath)
  return { pathname, targetPath }
}

const indexAssets = localReferences.map((reference) => verifyReference(reference, 'dist/index.html'))
const scripts = indexAssets.filter(({ pathname }) => /\.m?js$/i.test(pathname))
const styles = indexAssets.filter(({ pathname }) => /\.css$/i.test(pathname))

if (scripts.length === 0 || styles.length === 0) {
  fail('dist/index.html must reference at least one JavaScript and one CSS file')
}

for (const { pathname } of [...scripts, ...styles]) {
  if (!pathname.startsWith(`${expectedBase}assets/`)) {
    fail(`compiled JavaScript and CSS must be under ${expectedBase}assets/: ${pathname}`)
  }
}

for (const { pathname, targetPath } of styles) {
  const css = readFileSync(targetPath, 'utf8')
  const cssReferences = [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((match) => match[1])
  for (const reference of cssReferences) {
    if (/^(?:data:|[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)) continue
    verifyReference(new URL(reference, `https://pages.invalid${pathname}`).pathname, pathname)
  }
}

process.stdout.write(`Verified dist/index.html for ${expectedBase} (${verifiedFiles.size} local files).\n`)
