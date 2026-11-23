Local copy of the speech-to-text runtime used by asr-worker.js (captions).
Served from this folder so the app never loads code from a CDN.

  transformers.min.js                     @huggingface/transformers 4.3.2   (Apache-2.0, LICENSE-transformers.js.txt)
  ort-wasm-simd-threaded.asyncify.mjs     onnxruntime-web 1.31.0-dev.20260914-8d85527a0 (MIT, LICENSE-onnxruntime-web.txt)
  ort-wasm-simd-threaded.asyncify.wasm    same

To update: bump @huggingface/transformers in package.json (exact version), npm install, then copy
  node_modules/@huggingface/transformers/dist/transformers.min.js
  node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs
  node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm
The .wasm must come from the onnxruntime-web version that transformers.js pins, or it will not load.

The model (ivrit-ai/whisper-large-v3-turbo-onnx, Apache-2.0) is NOT in this folder: it is
downloaded once from Hugging Face after the user agrees in the page, and kept in the browser cache.
