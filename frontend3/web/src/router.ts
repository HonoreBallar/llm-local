import { useEffect, useState } from 'react';

/** Routage minimal par le hash : #/categories, #/fiches, #/fiches/12, #/fiches/nouvelle/cni */
const current = () => window.location.hash.slice(1) || '/categories';

export function useHash() {
  const [hash, setHash] = useState(current);
  useEffect(() => {
    const onChange = () => setHash(current());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export const navigate = (path: string) => {
  window.location.hash = path;
};
