module.exports = {

  root: true,
  "env": {
    "browser": true,
    "node": true,
    "es2021": true
  },

  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module",
  },

  rules: {
    'indent': ['warn', 2, {
      'SwitchCase': 1
    }],
    'comma-dangle': ['error', {
      arrays: 'always-multiline',
      objects: 'always-multiline',
      imports: 'always-multiline',
      exports: 'always-multiline',
      functions: 'always-multiline',
    }],
  }

}
