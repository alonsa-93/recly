/* Recly captions worker: speech-to-text with Whisper, entirely on this computer.
   The runtime (transformers.js + ONNX Runtime WASM) is served from vendor/, never from a CDN.
   The model itself is downloaded once from Hugging Face, only after the user agreed to it in the
   page, and is then kept in the browser cache ("transformers-cache"), so later runs work offline.
   No audio and no text ever leave this worker except back to the page. */
import { pipeline, env } from './vendor/transformers/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL('./vendor/transformers/', import.meta.url).href;

/* Whisper large-v3-turbo fine-tuned for Hebrew by ivrit.ai (Apache-2.0), ONNX export. */
const MODEL = 'ivrit-ai/whisper-large-v3-turbo-onnx';
let asr = null;
const files = {};

self.onmessage = async ({ data: m }) => {
  try {
    if (m.type === 'load') {
      if (!asr) {
        asr = await pipeline('automatic-speech-recognition', MODEL, {
          device: m.device, dtype: m.dtype,
          progress_callback: p => {
            if (p.status !== 'progress' || !p.file) return;
            files[p.file] = { l: p.loaded || 0, t: p.total || 0 };
            let l = 0, t = 0;
            for (const f of Object.values(files)) { l += f.l; t += f.t; }
            postMessage({ type: 'progress', loaded: l, total: t });
          }
        });
      }
      postMessage({ type: 'ready' });
    } else if (m.type === 'run') {
      const out = await asr(m.audio, {
        language: m.lang || null, task: 'transcribe', return_timestamps: true, chunk_length_s: 30, ...(m.opts || {})
      });
      postMessage({ type: 'result', chunks: (out.chunks || []).map(c => ({ ts: c.timestamp, text: c.text })), text: out.text || '' });
    }
  } catch (e) {
    postMessage({ type: 'error', message: String((e && e.message) || e) });
  }
};
