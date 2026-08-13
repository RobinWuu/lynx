import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const packageJsonPath = path.join(packageRoot, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const addonPath = path.join(
  packageRoot,
  'dist',
  'darwin',
  'arm64',
  'OpenCVDocumentScanner.node',
);

function fail(message) {
  throw new Error(`[verify-package] ${message}`);
}

function run(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

if (packageJson.name !== '@byted-lynx/opencv-document-scanner') {
  fail(`Unexpected package name: ${packageJson.name}`);
}

const podspecPath = path.join(
  packageRoot,
  'ios',
  'OpenCVDocumentScanner.podspec',
);
const podspec = fs.readFileSync(podspecPath, 'utf8');
const podspecVersion = podspec.match(/s\.version\s*=\s*['"]([^'"]+)['"]/)?.[1];
if (podspecVersion !== packageJson.version) {
  fail(
    `package.json version ${packageJson.version} does not match Podspec version ${podspecVersion}`,
  );
}

if (!fs.existsSync(addonPath) || !fs.statSync(addonPath).isFile()) {
  fail(`Missing Lynxtron prebuilt: ${addonPath}`);
}

const fileDescription = run('file', [addonPath]);
if (!fileDescription.includes('Mach-O 64-bit bundle arm64')) {
  fail(`Unexpected Lynxtron binary: ${fileDescription.trim()}`);
}

const loadCommands = run('otool', ['-l', addonPath]);
const minimumVersion = loadCommands.match(
  /LC_BUILD_VERSION[\s\S]*?\n\s*minos\s+([0-9.]+)/,
)?.[1];
if (minimumVersion === undefined) {
  fail('Unable to determine the Lynxtron deployment target.');
}

const [major] = minimumVersion.split('.').map(Number);
if (!Number.isFinite(major) || major > 12) {
  fail(
    `Lynxtron prebuilt requires macOS ${minimumVersion}; expected macOS 12.x or earlier.`,
  );
}

const dependencies = run('otool', ['-L', addonPath])
  .split('\n')
  .slice(1)
  .map((line) => line.trim().split(' ')[0])
  .filter(Boolean);
const invalidDependencies = dependencies.filter(
  (dependency) =>
    !dependency.startsWith('/usr/lib/') &&
    !dependency.startsWith('/System/Library/'),
);
if (invalidDependencies.length > 0) {
  fail(
    `Lynxtron prebuilt has non-system dynamic dependencies:\n${invalidDependencies.join('\n')}`,
  );
}

const undefinedSymbols = run('nm', ['-u', addonPath])
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.includes('napi_'));
const ordinaryNapiSymbols = undefinedSymbols.filter(
  (symbol) => !symbol.endsWith('_weak'),
);
if (undefinedSymbols.length === 0 || ordinaryNapiSymbols.length > 0) {
  fail(
    `Expected only weak-suffix N-API imports, found:\n${undefinedSymbols.join('\n')}`,
  );
}

const exportedSymbols = run('nm', ['-gU', addonPath]);
if (!exportedSymbols.includes('_napi_register_module_v1')) {
  fail('Missing standard Node-API registration entry.');
}

console.error(
  `[verify-package] ${packageJson.name}@${packageJson.version} is ready to pack.`,
);
