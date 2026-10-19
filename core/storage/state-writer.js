export function createStateWriter(write, delay = 500) {
  let timer, dirty = false, chain = Promise.resolve();
  function flush() {
    clearTimeout(timer); timer = undefined;
    if (!dirty) return chain;
    dirty = false;
    chain = chain.catch(() => {}).then(write);
    return chain;
  }
  return {
    schedule() { dirty = true; if (!timer) timer = setTimeout(() => flush().catch(console.error), delay); },
    flush() { dirty = true; return flush(); }
  };
}
