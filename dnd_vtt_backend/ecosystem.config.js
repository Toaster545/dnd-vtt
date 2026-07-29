module.exports = {
  apps: [
    {
      name: 'dnd-vtt',
      script: 'dist/main.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 3030,
      },
    },
  ],
};
