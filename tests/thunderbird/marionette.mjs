import net from 'node:net';

// Thunderbird's built-in automation protocol; used only with a disposable profile.
export async function connect(port) {
  const socket = net.createConnection({ host: '127.0.0.1', port });
  let buffer = Buffer.alloc(0), next = 1, ready, rejectHandshake;
  const pending = new Map();
  const handshake = new Promise((resolve, reject) => { ready = resolve; rejectHandshake = reject; });
  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const colon = buffer.indexOf(58);
      if (colon < 0) break;
      const length = Number(buffer.subarray(0, colon).toString());
      if (buffer.length < colon + 1 + length) break;
      const message = JSON.parse(buffer.subarray(colon + 1, colon + 1 + length).toString());
      buffer = buffer.subarray(colon + 1 + length);
      if (!Array.isArray(message)) { ready(message); continue; }
      const request = pending.get(message[1]);
      if (!request) continue;
      pending.delete(message[1]); clearTimeout(request.timer);
      if (message[2]) request.reject(new Error(JSON.stringify(message[2])));
      else request.resolve(message[3]);
    }
  });
  socket.on('error', error => {
    rejectHandshake(error);
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
  });
  let handshakeTimer;
  try {
    await Promise.race([handshake, new Promise((_, reject) => { handshakeTimer = setTimeout(() => reject(new Error('Marionette handshake timed out')), 5000); })]);
  } catch (error) { socket.destroy(); throw error; }
  finally { clearTimeout(handshakeTimer); }
  const command = (name, parameters = {}) => new Promise((resolve, reject) => {
    const id = next++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${name} timed out`)); }, 30000);
    pending.set(id, { resolve, reject, timer });
    const data = JSON.stringify([0, id, name, parameters]);
    socket.write(`${Buffer.byteLength(data)}:${data}`);
  });
  await command('WebDriver:NewSession', { capabilities: { alwaysMatch: {} } });
  await command('Marionette:SetContext', { value: 'chrome' });
  return {
    command,
    execute: async (script, args = []) => (await command('WebDriver:ExecuteScript', { script, args, newSandbox: true })).value,
    close() { for (const request of pending.values()) clearTimeout(request.timer); socket.destroy(); },
  };
}
