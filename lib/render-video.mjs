// Bounded, fail-fast frame producer and streaming FFmpeg encoder.
import { spawn } from 'node:child_process';
import { once, EventEmitter } from 'node:events';
import { subframeTime } from './production.mjs';

export async function encodeFrames({ workers, frames, blur, fps, dest, shot, signal }) {
  const filter = blur > 1
    ? '[0:v]tmix=frames=' + blur + ',select=not(mod(n+1\\,' + blur + ')),setpts=N/(' + fps + '*TB),format=yuv420p[vout]'
    : '[0:v]format=yuv420p[vout]';
  const ff = spawn('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-f', 'image2pipe',
    '-framerate', String(fps * blur), '-i', '-', '-filter_complex', filter,
    '-map', '[vout]', '-r', String(fps), '-c:v', 'libx264',
    '-crf', '18', '-movflags', '+faststart', dest],
  { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });

  let stderr = '', error = null, closed = false, next = 0, written = 0;
  let lastProgress = Date.now();
  const total = frames * blur;
  const ready = new Map();
  const events = new EventEmitter();
  events.setMaxListeners(Math.max(32, workers.length * 4));
  const limit = workers.length * 4;

  function fail(reason) {
    if (error) return;
    error = reason instanceof Error ? reason : new Error(String(reason));
    ff.kill('SIGKILL');
    events.emit('change');
  }
  const abort = () => fail(signal.reason ?? new Error('Cancelled'));
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  ff.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-12000); });
  ff.on('error', fail);
  ff.stdin.on('error', fail);
  const ended = new Promise((resolve, reject) => {
    ff.on('close', (code, signame) => {
      closed = true;
      if (code !== 0 || error || written !== total) {
        const cause = error || new Error('FFmpeg closed before output was complete: code=' + code + ' signal=' + signame + ' frames=' + written + '/' + total + '\n' + stderr);
        fail(cause);
        reject(cause);
      } else resolve();
      events.emit('change');
    });
  });
  ended.catch(() => {}); // An early child exit must not cause an unhandled rejection.
  const watchdog = setInterval(() => {
    if (!closed && Date.now() - lastProgress > 120000)
      fail(new Error('Capture / encode made no progress for 120s. ' + stderr));
  }, 5000);

  const wait = async (predicate) => {
    while (!predicate()) {
      if (error) throw error;
      if (closed) throw new Error('FFmpeg closed during frame capture: ' + stderr);
      await once(events, 'change');
    }
    if (error) throw error;
  };

  async function producer(worker) {
    try {
      for (;;) {
        await wait(() => next >= total || next - written < limit);
        if (next >= total) return;
        const frame = next++;
        const png = await shot(worker, subframeTime(frame, blur, fps));
        ready.set(frame, png);
        lastProgress = Date.now();
        events.emit('change');
      }
    } catch (e) { fail(e); throw e; }
  }

  async function consumer() {
    try {
      for (let frame = 0; frame < total; frame++) {
        await wait(() => ready.has(frame));
        const png = ready.get(frame);
        ready.delete(frame);
        written = frame + 1;
        events.emit('change');
        if (!ff.stdin.write(png)) {
          await Promise.race([
            once(ff.stdin, 'drain'),
            ended.then(() => { throw new Error('Encoder closed before next drain'); }),
          ]);
        }
        lastProgress = Date.now();
        if ((frame + 1) % (fps * blur) === 0)
          process.stdout.write('\rframe ' + (frame + 1) / blur + '/' + frames);
      }
      ff.stdin.end();
      await ended;
    } catch (e) { fail(e); throw e; }
  }

  try {
    const outcomes = await Promise.allSettled([...workers.map(producer), consumer()]);
    const bad = outcomes.find((r) => r.status === 'rejected');
    if (bad) throw bad.reason;
    await ended;
    console.log('\nEncoded ' + frames + ' frames');
  } finally {
    clearInterval(watchdog);
    signal?.removeEventListener('abort', abort);
    if (!closed) {
      ff.kill('SIGKILL');
      await ended.catch(() => {});
    }
  }
}
