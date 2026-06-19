const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API_PORT = 3001;
const VITE_PORT = 5173;
const children = [];

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function spawnLogged(command, args) {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  children.push(child);
  return child;
}

async function waitForPort(port, label) {
  for (let i = 0; i < 60; i += 1) {
    if (await isPortOpen(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not start on port ${port}`);
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function stopChildren() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

async function main() {
  const hasApi = await isPortOpen(API_PORT);
  if (hasApi) {
    console.log(`[desktop] Reusing API server on port ${API_PORT}`);
  } else {
    console.log(`[desktop] Starting API server on port ${API_PORT}`);
    spawnLogged(npmCommand(), ['run', 'server']);
    await waitForPort(API_PORT, 'API server');
  }

  const hasVite = await isPortOpen(VITE_PORT);
  if (hasVite) {
    console.log(`[desktop] Reusing Vite server on port ${VITE_PORT}`);
  } else {
    console.log(`[desktop] Starting Vite server on port ${VITE_PORT}`);
    spawnLogged(npmCommand(), ['exec', 'vite', '--', '--host', '127.0.0.1']);
    await waitForPort(VITE_PORT, 'Vite server');
  }

  const electronPath = require('electron');
  const electron = spawnLogged(electronPath, [path.join(__dirname, 'main.cjs')]);
  electron.on('exit', (code) => {
    stopChildren();
    process.exit(code ?? 0);
  });
}

process.on('SIGINT', () => {
  stopChildren();
  process.exit(130);
});

process.on('SIGTERM', () => {
  stopChildren();
  process.exit(143);
});

main().catch((error) => {
  console.error('[desktop]', error.message);
  stopChildren();
  process.exit(1);
});
