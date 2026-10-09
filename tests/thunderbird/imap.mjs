import net from 'node:net';

/** Independent read-back from our synthetic loopback GreenMail fixture. */
export async function readDrafts(port) {
  const socket = net.createConnection({ host: '127.0.0.1', port });
  let buffer = '', waiting, sequence = 0;
  socket.setEncoding('utf8');
  socket.on('data', chunk => { buffer += chunk; waiting?.(); });
  socket.on('error', error => { waiting?.(error); });
  const until = pattern => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting = null; reject(new Error('Synthetic IMAP timed out')); }, 10000);
    waiting = error => {
      if (error) { clearTimeout(timer); waiting = null; reject(error); }
      else if (pattern.test(buffer)) { clearTimeout(timer); waiting = null; const value = buffer; buffer = ''; resolve(value); }
    };
    waiting();
  });
  const command = async text => {
    const tag = `t${++sequence}`;
    const response = until(new RegExp(`(?:^|\\r\\n)${tag} (?:OK|NO|BAD)[^\\r]*\\r\\n`, 'i'));
    socket.write(`${tag} ${text}\r\n`);
    const value = await response;
    if (!new RegExp(`(?:^|\\r\\n)${tag} OK`, 'i').test(value)) throw new Error(`Synthetic IMAP rejected ${text.split(' ')[0]}`);
    return value;
  };
  try {
    await until(/^\* OK[^\r]*\r\n/i);
    await command('LOGIN synthetic synthetic');
    await command('SELECT Drafts');
    return await command('UID FETCH 1:* (BODY.PEEK[])');
  } finally { socket.destroy(); }
}
