import { getPosixFilePath, isFile } from '../common/utils';
import { CliStrictFileChecker } from './CliStrictFileChecker';
import { getPluginConfig } from './getPluginConfig';
import { exec } from 'child_process';

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
  const appFilesCheckedByTs = await getFilesFromTSConfigApp();
  const appFilePaths = appFilesCheckedByTs.split(/\r?\n/).filter(isFile).map(getPosixFilePath);
  const specFilesCheckedByTs = await getFilesFromTSConfigSpec();
  const specFilePaths = specFilesCheckedByTs.split(/\r?\n/).filter(isFile).map(getPosixFilePath);

  // The app and spec programs overlap: any file a spec imports is listed by both.
  // Deduplicate, otherwise findStrictErrors reports its errors once per listing.
  return [...new Set(filterOutNodeModulesFiles([...appFilePaths, ...specFilePaths]))];
}

function getFilesFromTSConfigApp(tsconfigPath = './tsconfig.app.json'): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`tsc -p ${tsconfigPath} --listFilesOnly`, (error, stdout, stderr) => {
      if (error) return reject(error);
      if (stderr) console.error(stderr);

      resolve(stdout);
    });
  });
}
function getFilesFromTSConfigSpec(tsconfigPath = './tsconfig.spec.json'): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`tsc -p ${tsconfigPath} --listFilesOnly`, (error, stdout, stderr) => {
      if (error) return reject(error);
      if (stderr) console.error(stderr);

      resolve(stdout);
    });
  });
}
