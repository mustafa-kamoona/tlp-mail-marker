import { execFileSync } from 'node:child_process';

/** 7-Zip is present on the Windows CI runner; zip is used on macOS/Linux. */
export function archiveDirectory(directory, destination) {
  if (process.platform === 'win32') {
    execFileSync('7z', ['a', '-tzip', '-mx=9', destination, '.'], { cwd: directory, stdio: 'inherit' });
  } else {
    execFileSync('zip', ['-q', '-r', '-X', '-9', destination, '.'], { cwd: directory, stdio: 'inherit' });
  }
}
