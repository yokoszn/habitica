/* eslint-disable import/no-commonjs */
module.exports = {
  extends: [
    'habitrpg/lib/node',
  ],
  parserOptions: {
    // needed for dynamic imports (of ES module only dependencies)
    ecmaVersion: 2020,
  },
};
