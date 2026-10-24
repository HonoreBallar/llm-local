import { useEffect, useState } from 'react';
import { fichesApi } from './api';
import type { FicheType, TypeDef } from './types';

// Les définitions ne changent pas pendant la session : un seul appel.
let cache: Promise<TypeDef[]> | null = null;

export function useFicheTypes(): Record<FicheType, TypeDef> | null {
  const [types, setTypes] = useState<Record<FicheType, TypeDef> | null>(null);
  useEffect(() => {
    cache ??= fichesApi.types().catch((e) => {
      cache = null;
      throw e;
    });
    cache
      .then((list) => setTypes(Object.fromEntries(list.map((t) => [t.type, t])) as Record<FicheType, TypeDef>))
      .catch(() => setTypes(null));
  }, []);
  return types;
}
