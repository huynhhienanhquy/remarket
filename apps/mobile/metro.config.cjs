const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
const sourceRoots = ['shared', 'api-client'].map(name => path.resolve(__dirname, '../../packages', name, 'src') + path.sep);
// These source packages use Node-compatible .js imports for the API build.
// Metro does not remap that suffix to TypeScript automatically.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (sourceRoots.some(root => context.originModulePath.startsWith(root)) && moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    return context.resolveRequest(context, moduleName.slice(0, -3) + '.ts', platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
