const path = require('path');

const appRoot = path.resolve(__dirname, '..');

module.exports = {
  apps: [
    {
      name: '7-aside-backend',
      cwd: path.join(appRoot, 'appBackend'),
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: '4000',
      },
    },
  ],
};
