import { useEffect, useState } from 'react';

export const ROUTES = ['today', 'focus', 'journal', 'insights', 'history', 'setup'];

function read() {
  const name = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES.includes(name) ? name : 'today';
}

/** Hash routing (#today, #journal, ...) works on GitHub Pages without server rules. */
export function useHashRoute() {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(name) {
  if (window.location.hash !== `#${name}`) window.location.hash = name;
}
