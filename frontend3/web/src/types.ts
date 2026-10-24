export interface Category {
  id: number;
  nom: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategoryInput {
  nom: string;
  description: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

export interface PendingDelete {
  id: number;
  nom: string;
}

export interface ChatResult {
  reply: string;
  changed: boolean;
  pendingDelete: PendingDelete | null;
}

// ---------- Fiches ----------

export type FicheType = 'cni' | 'kyc';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'date' | 'select' | 'email' | 'tel' | 'textarea';
  required?: boolean;
  options?: string[];
}

export interface DocDef {
  role: string;
  label: string;
  multiple: boolean;
  required: boolean;
}

export interface TypeDef {
  type: FicheType;
  label: string;
  description: string;
  fields: FieldDef[];
  documents: DocDef[];
  reference: string;
}

export type Donnees = Record<string, string>;

export interface FicheDocument {
  id: number;
  role: string;
  nom_fichier: string;
  mime: string;
  taille: number;
  created_at: string;
}

export type Verdict = 'conforme' | 'a_verifier' | 'non_conforme';

export interface ChampCompare {
  key: string;
  label: string;
  fiche: string | null;
  lu: string | null;
  statut: 'ok' | 'ecart' | 'non_lu';
}

export type Analyse =
  | { statut: 'en_cours'; lance_le: string }
  | { statut: 'erreur'; lance_le: string; message: string }
  | {
      statut: 'termine';
      lance_le: string;
      termine_le: string;
      duree_s: number;
      verdict: Verdict;
      est_document_attendu: boolean;
      type_detecte: string;
      confiance: number;
      raisons: string[];
      champs: ChampCompare[];
      alertes: string[];
      documents: string[];
    };

export interface Fiche {
  id: number;
  type: FicheType;
  donnees: Donnees;
  analyse: Analyse | null;
  created_at: string;
  updated_at: string;
  nb_documents?: number;
  documents?: FicheDocument[];
}
