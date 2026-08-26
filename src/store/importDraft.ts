import { create } from 'zustand';

import { AnnotatedCandidate } from '@/src/lib/pdfImport/dedupe';
import { CrossCheck, ParseSubject } from '@/src/lib/pdfImport/types';

interface ImportDraft {
  candidates: AnnotatedCandidate[];
  crossChecks: CrossCheck[];
  ruleId: string;
  /** Who the imported roster belongs to, so the wrong file is obvious before anything is saved. */
  subject?: ParseSubject;
}

interface ImportDraftState extends ImportDraft {
  setDraft: (draft: ImportDraft) => void;
  updateCandidate: (index: number, candidate: AnnotatedCandidate) => void;
  clear: () => void;
}

const EMPTY_DRAFT: ImportDraft = { candidates: [], crossChecks: [], ruleId: '', subject: undefined };

export const useImportDraftStore = create<ImportDraftState>((set) => ({
  ...EMPTY_DRAFT,
  setDraft: (draft) => set(draft),
  updateCandidate: (index, candidate) =>
    set((state) => ({
      candidates: state.candidates.map((existing, i) => (i === index ? candidate : existing)),
    })),
  clear: () => set(EMPTY_DRAFT),
}));
