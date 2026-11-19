export function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  try {
    return { view: parts[0] || 'home', id: decodeURIComponent(parts[1] || ''), paragraph: decodeURIComponent(parts[2] || '') };
  } catch { return { view: 'missing', id: '', paragraph: '' }; }
}
export function navigate(hash, render) {
  if (location.hash === hash) render();
  else location.hash = hash;
}
