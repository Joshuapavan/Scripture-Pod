// Main-process handle on the Bible search worker (see bible-search-worker.js).
const path = require('path');
const { Worker } = require('worker_threads');

function createBibleSearch(dbPath) {
  let worker = null;
  let nextId = 1;
  const pending = new Map();

  function failAll(error) {
    pending.forEach(({ reject }) => reject(error));
    pending.clear();
    worker = null;
  }

  function start() {
    worker = new Worker(path.join(__dirname, 'bible-search-worker.js'), { workerData: { dbPath } });
    worker.on('message', ({ requestId, result, error }) => {
      const entry = pending.get(requestId);
      if (!entry) return;
      pending.delete(requestId);
      if (error) entry.reject(new Error(error));
      else entry.resolve(result);
    });
    worker.on('error', failAll);
    worker.on('exit', () => failAll(new Error('bible search worker stopped')));
    return worker;
  }

  return {
    call(method, payload) {
      return new Promise((resolve, reject) => {
        const requestId = nextId++;
        pending.set(requestId, { resolve, reject });
        (worker || start()).postMessage({ requestId, method, payload });
      });
    },
    close() {
      if (worker) worker.terminate();
    }
  };
}

module.exports = { createBibleSearch };
