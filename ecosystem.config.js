/**
 * PM2 Ecosystem Config
 *
 * IMPORTANT — instances MUST stay at 1 (fork mode).
 * The SSE client registry (utils/sseClients.js) is in-process memory.
 * Cluster mode (multiple workers) would mean a notification sent in
 * worker A never reaches a client connected to worker B.
 */
module.exports = {
    apps: [
        {
            name:        'school-app',
            script:      'server.js',
            instances:   1,          // single instance — required for SSE
            exec_mode:   'fork',     // NOT 'cluster'
            watch:       false,
            max_memory_restart: '500M',
            error_file:  './logs/err.log',
            out_file:    './logs/out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            env: {
                NODE_ENV: 'production',
            },
        },
    ],
};
