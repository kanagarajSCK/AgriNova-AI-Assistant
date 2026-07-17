import { spawn } from 'child_process';

const port = process.env.PORT || '3000';
console.log(`Starting Python Flask backend on port ${port}...`);

const child = spawn('python3', ['run.py'], {
  env: {
    ...process.env,
    PORT: port
  },
  stdio: 'inherit'
});

child.on('close', (code) => {
  console.log(`Python process exited with code ${code}`);
  process.exit(code || 0);
});
