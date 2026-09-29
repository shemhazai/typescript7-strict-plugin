import { PLUGIN_NAME } from '../common/constants';

export const notConfiguredError = `
${PLUGIN_NAME} isn't configured in tsconfig.json
        
Please add following configuration:
{
  "compilerOptions": {
    ...
    "plugins": [{
      "name": "${PLUGIN_NAME}"
    }]
  },
}
`;

export const noStrictFilesError = `
Project does not contain any strict files.
`;
