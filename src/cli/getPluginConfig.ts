import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../common/types';
import { PLUGIN_NAME } from '../common/constants';

interface RawTsconfig {
  extends?: string | string[];
  compilerOptions?: { plugins?: { name: string }[] };
}

// TypeScript 7 (the native/Go compiler) strips `plugins` from `tsc --showConfig`,
// so the plugin can no longer be detected from the resolved config. Read the raw
// tsconfig instead and look for the plugin there.
function getProjectTsconfigPath(): string {
  const argv = process.argv.slice(2);
  let projectArg: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-p' || argv[i] === '--project') {
      projectArg = argv[i + 1];
      break;
    }
  }
  let projectPath = path.resolve(process.cwd(), projectArg || 'tsconfig.json');
  try {
    if (fs.statSync(projectPath).isDirectory()) {
      projectPath = path.join(projectPath, 'tsconfig.json');
    }
  } catch {
    // fall back to the resolved path as-is
  }
  return projectPath;
}

function stripJsonComments(text: string): string {
  let result = '';
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        result += char;
      }
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      result += char;
      if (char === '\\') {
        result += next ?? '';
        i++;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }
    if (char === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    result += char;
  }
  return result;
}

function parseTsconfig(raw: string): RawTsconfig {
  const withoutComments = stripJsonComments(raw);
  const withoutTrailingCommas = withoutComments.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(withoutTrailingCommas);
}

function isExistingFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

// An `extends` entry is resolved the way TypeScript resolves it: a relative or
// absolute path, which may point at a directory or omit the `.json` suffix, and
// otherwise a node module specifier.
function resolveExtendsPath(specifier: string, containingFile: string): string | undefined {
  const containingDir = path.dirname(containingFile);
  const isPathLike =
    specifier.startsWith('./') || specifier.startsWith('../') || path.isAbsolute(specifier);

  if (isPathLike) {
    const resolved = path.resolve(containingDir, specifier);
    return [resolved, path.join(resolved, 'tsconfig.json'), `${resolved}.json`].find(
      isExistingFile,
    );
  }

  try {
    return require.resolve(specifier, { paths: [containingDir] });
  } catch {
    return undefined;
  }
}

// `plugins` lives in `compilerOptions`, which TypeScript merges along the
// `extends` chain: the inheriting file wins over the file it extends, and within
// an `extends` array the last entry wins. Walk the chain in that order and stop
// at the first file that declares `plugins`. `visited` guards against cycles.
function findPluginsInChain(
  tsconfigPath: string,
  visited: Set<string>,
): { name: string }[] | undefined {
  const normalizedPath = path.resolve(tsconfigPath);

  if (visited.has(normalizedPath)) {
    return undefined;
  }
  visited.add(normalizedPath);

  let tsconfig: RawTsconfig;
  try {
    tsconfig = parseTsconfig(fs.readFileSync(normalizedPath, 'utf-8'));
  } catch {
    return undefined;
  }

  const plugins = tsconfig.compilerOptions?.plugins;
  if (plugins) {
    return plugins;
  }

  if (!tsconfig.extends) {
    return undefined;
  }

  const specifiers = Array.isArray(tsconfig.extends)
    ? [...tsconfig.extends].reverse()
    : [tsconfig.extends];

  for (const specifier of specifiers) {
    const extendsPath = resolveExtendsPath(specifier, normalizedPath);

    if (!extendsPath) {
      continue;
    }

    const inheritedPlugins = findPluginsInChain(extendsPath, visited);
    if (inheritedPlugins) {
      return inheritedPlugins;
    }
  }

  return undefined;
}

export async function getPluginConfig(): Promise<Config | undefined> {
  try {
    const projectPath = getProjectTsconfigPath();
    const plugins = findPluginsInChain(projectPath, new Set());

    return plugins?.find(
      (plugin: { name: string }) =>
        plugin.name === PLUGIN_NAME ||
        (process.env.NODE_ENV === 'test' && plugin.name === '../../dist/plugin'),
    ) as Config | undefined;
  } catch {
    return undefined;
  }
}
