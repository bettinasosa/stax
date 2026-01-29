const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Supabase sub-packages (realtime-js, auth-js) require "tslib" but Metro sometimes
// fails to resolve it from nested node_modules. Force resolution to project root.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  tslib: path.resolve(__dirname, 'node_modules/tslib'),
};

module.exports = config;
