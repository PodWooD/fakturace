module.exports = {
  apps: [
    {
      name: 'fakturace-backend',
      script: 'npm',
      args: 'run start',
      cwd: './backend',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      }
    },
    {
      name: 'fakturace-frontend',
      script: 'npm',
      args: 'start',
      cwd: './frontend',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3030
      }
    }
  ]
};
