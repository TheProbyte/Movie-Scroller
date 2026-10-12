// node:sqlite prints an "experimental" warning on load; keep the console tidy.
const defaults = process.listeners('warning');
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' && w.message.includes('SQLite')) return;
  for (const l of defaults) l(w);
});
