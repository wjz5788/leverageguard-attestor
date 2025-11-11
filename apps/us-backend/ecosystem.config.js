/**
 * PM2进程守护配置文件
 * 用于生产环境部署和监控
 */

module.exports = {
  apps: [
    {
      name: 'liqpass-backend',
      script: './dist/app.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      // 健康检查配置
      health_check: {
        url: 'http://localhost:3000/health',
        interval: 30000, // 30秒检查一次
        timeout: 5000
      }
    },
    {
      name: 'contract-listener',
      script: './dist/services/contractListenerService.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      },
      env_development: {
        NODE_ENV: 'development'
      },
      error_file: './logs/contract-listener-error.log',
      out_file: './logs/contract-listener-out.log',
      log_file: './logs/contract-listener-combined.log',
      time: true,
      // 重启策略
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000
    }
  ],

  // 部署配置
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:your-org/liqpass.git',
      path: '/var/www/liqpass',
      'pre-deploy': 'git fetch --all',
      'post-deploy': [
        'npm install',
        'npm run build',
        'pm2 reload ecosystem.config.js --env production',
        'pm2 save'
      ]
    }
  }
};