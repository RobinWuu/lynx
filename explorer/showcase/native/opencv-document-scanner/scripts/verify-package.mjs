import fs from 'node:fs';
import { createHash } from 'node:crypto';
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
const manifest = JSON.parse(
  fs.readFileSync(path.join(packageRoot, 'lynx.lib.json'), 'utf8'),
);
const addonPath = path.join(
  packageRoot,
  'dist',
  'macos',
  'arm64',
  'opencv-document-scanner.node',
);
const harmonyOpenCVPath = path.join(
  packageRoot,
  'harmony',
  'src',
  'main',
  'cpp',
  'third_party',
  'opencv-mobile-4.13.0-harmonyos.zip',
);
const harmonyOpenCVSha256 =
  '34a7deb0fa11faa7dddd8f80d4e62fae821ed227de6f43ead521a755dce95375';
const opencvMobileLicensesPath = path.join(
  packageRoot,
  'licenses',
  'opencv-mobile-4.13.0',
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
  'byted-lynx-opencv-document-scanner.podspec',
);
const podspec = fs.readFileSync(podspecPath, 'utf8');
const podspecVersion = podspec.match(/s\.version\s*=\s*['"]([^'"]+)['"]/)?.[1];
if (podspecVersion !== packageJson.version) {
  fail(
    `package.json version ${packageJson.version} does not match Podspec version ${podspecVersion}`,
  );
}

const androidAddon = manifest.platforms?.android?.nodeApiAddons?.[0];
if (
  manifest.platforms?.android?.providerClassName !== null
  || androidAddon?.name !== 'OpenCVDocumentScanner'
  || Object.hasOwn(androidAddon ?? {}, 'jniLibsDir')
) {
  fail('Android manifest must describe a source-built Node-API-only addon.');
}

const iosAddon = manifest.platforms?.ios?.nodeApiAddons?.[0];
if (
  iosAddon?.podName !== 'byted-lynx-opencv-document-scanner'
  || Object.hasOwn(iosAddon ?? {}, 'required')
) {
  fail('iOS manifest must use the scanner pod without a required field.');
}

const harmonyAddon = manifest.platforms?.harmony?.nodeApiAddons?.[0];
if (
  manifest.platforms?.harmony?.providerExportName !== null
  || harmonyAddon?.initializerExportName !== 'initializeNodeApiAddon'
) {
  fail('Harmony manifest must initialize a Node-API-only addon.');
}

if (!fs.existsSync(harmonyOpenCVPath)) {
  fail(`Missing Harmony OpenCV archive: ${harmonyOpenCVPath}`);
}
const actualHarmonyOpenCVSha256 = createHash('sha256')
  .update(fs.readFileSync(harmonyOpenCVPath))
  .digest('hex');
if (actualHarmonyOpenCVSha256 !== harmonyOpenCVSha256) {
  fail(
    `Harmony OpenCV SHA-256 ${actualHarmonyOpenCVSha256} does not match ${harmonyOpenCVSha256}.`,
  );
}

if (
  !fs.existsSync(path.join(opencvMobileLicensesPath, 'OpenCV-LICENSE'))
  || fs.existsSync(path.join(packageRoot, 'licenses', 'opencv5'))
) {
  fail('OpenCV Mobile licenses must be published under licenses/opencv-mobile-4.13.0.');
}

for (const localPath of [
  'android/.cxx',
  'android/build',
  'build',
  'node_modules',
  'shared/third_party',
]) {
  if (packageJson.files?.includes(localPath)) {
    fail(`package.json must not publish local build path ${localPath}.`);
  }
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
