import net from 'node:net';

/** Synthetic loopback mailbox only; no real accounts or mail. */
export async function mailbox(operation, folder = 'INBOX') {
  const socket = net.createConnection({ host: '127.0.0.1', port: 3143 });
  let buffer = '', waiter, sequence = 0;
  socket.setEncoding('utf8');
  socket.on('data', chunk => { buffer += chunk; waiter?.(); });
  socket.on('error', error => waiter?.(error));
  const until = pattern => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiter = null; reject(new Error('Synthetic IMAP timeout')); }, 10000);
    waiter = error => {
      if (error || pattern.test(buffer)) {
        clearTimeout(timer); waiter = null;
        const value = buffer; buffer = '';
        if (error) reject(error); else resolve(value);
      }
    };
    waiter();
  });
  const command = async text => {
    const tag = `f${++sequence}`;
    const response = until(new RegExp(`(?:^|\\r\\n)${tag} (?:OK|NO|BAD)[^\\r]*\\r\\n`, 'i'));
    socket.write(`${tag} ${text}\r\n`);
    const value = await response;
    if (!new RegExp(`(?:^|\\r\\n)${tag} OK`, 'i').test(value)) throw new Error(`IMAP rejected ${text.split(' ')[0]}`);
    return value;
  };
  try {
    await until(/^\* OK[^\r]*\r\n/i);
    await command('LOGIN "test@example.com" test');
    await command(`SELECT ${folder}`);
    return await operation({ command, until, socket });
  } finally { socket.destroy(); }
}

export async function inject(subject, body) {
  const raw = ['From: sender@example.org', 'To: test@example.com', `Subject: ${subject}`,
    `Message-ID: <${Date.now()}@example.org>`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8', '', body].join('\r\n');
  return mailbox(async ({ command, until, socket }) => {
    const tag = 'append';
    const ready = until(/\+[^\r]*\r\n/);
    socket.write(`${tag} APPEND INBOX (\\Seen) {${Buffer.byteLength(raw)}}\r\n`);
    await ready;
    const saved = until(/append (?:OK|NO|BAD)[^\r]*\r\n/);
    socket.write(`${raw}\r\n`);
    if (!/append OK/.test(await saved)) throw new Error('Synthetic message append failed');
    const response = await command('UID SEARCH ALL');
    return response.match(/\* SEARCH ([\d ]*)/)[1].trim().split(/\s+/).at(-1);
  });
}

export const messages = () => mailbox(({ command }) => command('UID FETCH 1:* (BODY.PEEK[])'));
