import { getPosixFilePath, isFile } from '../common/utils';
import { CliStrictFileChecker } from './CliStrictFileChecker';
import { getPluginConfig } from './getPluginConfig';
import execa from 'execa';

export async function findStrictFiles(): Promise<string[]> {
  const filesCheckedByTS = await getFilesCheckedByTs();

  const cliStrictFileChecker = new CliStrictFileChecker();
  const pluginConfig = await getPluginConfig();

  if (!pluginConfig) {
    return [];
  }

  return filesCheckedByTS.filter((filePath) =>
    cliStrictFileChecker.isFileStrict(filePath, pluginConfig),
  );
}

const filterOutNodeModulesFiles = (files: string[]): string[] => {
  return files.filter((filePath) => !filePath.includes('/node_modules/'));
};

async function getFilesCheckedByTs(): Promise<string[]> {
  const appFilePaths = await listFilesFromTSConfig('./tsconfig.app.json');
  const specFilePaths = await listFilesFromTSConfig('./tsconfig.spec.json');

  // The app and spec programs overlap: any file a spec imports is listed by both.
  // Deduplicate, otherwise findStrictErrors reports its errors once per listing.
  return [...new Set(filterOutNodeModulesFiles([...appFilePaths, ...specFilePaths]))];
}

// `preferLocal` puts the consuming project's `node_modules/.bin` on the PATH, so this runs
// the TypeScript version that project depends on instead of a global install, and matches
// how the checker in `typescript/typescript.ts` already resolves `tsc`. Arguments go in an
// array so a tsconfig path containing spaces is never split.
async function listFilesFromTSConfig(tsconfigPath: string): Promise<string[]> {
  const { stdout, stderr } = await execa('tsc', ['-p', tsconfigPath, '--listFilesOnly'], {
    preferLocal: true,
  });

  if (stderr) {
    console.error(stderr);
  }

  return stdout.split(/\r?\n/).filter(isFile).map(getPosixFilePath);
}
