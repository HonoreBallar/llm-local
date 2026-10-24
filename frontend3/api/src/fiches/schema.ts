// Définition des deux types de fiche : sert à la validation côté API et au rendu des formulaires
// côté front (exposée par GET /api/fiches/types).

export type FicheType = 'cni' | 'kyc';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'date' | 'select' | 'email' | 'tel' | 'textarea';
  required?: boolean;
  options?: string[];
  /** Comment comparer la valeur de la fiche avec celle lue sur le document lors de l'analyse. */
  compare?: 'date' | 'id' | 'text';
}

export interface DocDef {
  role: string;
  label: string;
  multiple: boolean;
  /** Nécessaire pour lancer l'analyse. */
  required: boolean;
}

export interface TypeDef {
  type: FicheType;
  label: string;
  description: string;
  fields: FieldDef[];
  documents: DocDef[];
  /** Champ affiché en plus du nom dans la liste (numéro de CNI, téléphone…). */
  reference: string;
}

const SEXE = ['M', 'F'];
const SOURCES_REVENUS = [
  'Salaire',
  'Activité indépendante',
  'Commerce',
  'Agriculture',
  'Pension / retraite',
  'Aide familiale',
  'Autre',
];

export const FICHE_TYPES: Record<FicheType, TypeDef> = {
  cni: {
    type: 'cni',
    label: 'CNI',
    description: "Carte nationale d'identité de Côte d'Ivoire",
    reference: 'numero_cni',
    fields: [
      { key: 'nom', label: 'Nom', type: 'text', required: true },
      { key: 'prenoms', label: 'Prénoms', type: 'text', required: true },
      { key: 'sexe', label: 'Sexe', type: 'select', options: SEXE, compare: 'id' },
      { key: 'date_naissance', label: 'Date de naissance', type: 'date', compare: 'date' },
      { key: 'lieu_naissance', label: 'Lieu de naissance', type: 'text', compare: 'text' },
      { key: 'numero_cni', label: 'N° de CNI', type: 'text', required: true, compare: 'id' },
      { key: 'date_delivrance', label: 'Date de délivrance', type: 'date', compare: 'date' },
      { key: 'date_expiration', label: "Date d'expiration", type: 'date', compare: 'date' },
    ],
    documents: [
      { role: 'recto', label: 'Recto', multiple: false, required: true },
      { role: 'verso', label: 'Verso', multiple: false, required: false },
    ],
  },
  kyc: {
    type: 'kyc',
    label: 'KYC',
    description: 'Connaissance client : identité, coordonnées, revenus et justificatifs',
    reference: 'telephone',
    fields: [
      { key: 'nom', label: 'Nom', type: 'text', required: true },
      { key: 'prenoms', label: 'Prénoms', type: 'text', required: true },
      { key: 'date_naissance', label: 'Date de naissance', type: 'date' },
      { key: 'telephone', label: 'Téléphone', type: 'tel', required: true },
      { key: 'email', label: 'E-mail', type: 'email' },
      { key: 'adresse', label: 'Adresse', type: 'textarea', required: true, compare: 'text' },
      { key: 'ville', label: 'Ville', type: 'text' },
      { key: 'profession', label: 'Profession', type: 'text' },
      { key: 'employeur', label: 'Employeur', type: 'text' },
      { key: 'source_revenus', label: 'Source de revenus', type: 'select', options: SOURCES_REVENUS },
      { key: 'numero_piece', label: "N° de pièce d'identité", type: 'text' },
    ],
    documents: [
      {
        role: 'justificatif',
        label: 'Justificatifs (domicile, formulaire KYC signé, revenus…)',
        multiple: true,
        required: true,
      },
    ],
  },
};

export const isFicheType = (t: unknown): t is FicheType => t === 'cni' || t === 'kyc';
