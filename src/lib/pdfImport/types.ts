import { CabinCrewLogEntry } from '@/src/types/logbook';

/** A single positioned text chunk as extracted from a PDF page. */
export interface TextItem {
  str: string;
  /** Distance from the left edge of the page, in PDF points. */
  x: number;
  /** Distance from the TOP of the page, in PDF points (normalized so ascending y = reading order). */
  y: number;
  width: number;
}

export interface ExtractedPage {
  items: TextItem[];
  width: number;
  height: number;
}

export type ParseConfidence = 'high' | 'medium' | 'low';

/** An entry the parser proposes, always shown for review before anything is saved. */
export interface ParsedCandidate {
  fields: Partial<CabinCrewLogEntry>;
  rawSourceLine: string;
  confidence: ParseConfidence;
  /**
   * Human-readable notes on what this row needs checked, shown verbatim on the review screen.
   * Written as sentences rather than field names so they can be acted on without knowing the
   * internals — an import that quietly says "Check this" is not actionable.
   */
  unmatchedFields: string[];
}

export interface CrossCheck {
  label: string;
  parsedTotalMinutes: number;
  reportedTotalMinutes: number;
  matches: boolean;
  /**
   * Set when the report's own figure is not computed the same way as ours, so a difference is
   * expected rather than a fault — the airline's contractual night count, for one. Shown as a
   * comparison instead of a pass/fail.
   */
  informational?: boolean;
  note?: string;
}

/** Who the imported report belongs to, shown on the review screen so the wrong file is obvious. */
export interface ParseSubject {
  staffId: string;
  name: string;
  rank?: string;
  base?: string;
  periodStart?: string;
  periodEnd?: string;
}

export interface ParseResult {
  ruleId: string;
  candidates: ParsedCandidate[];
  crossChecks: CrossCheck[];
  subject?: ParseSubject;
}

export interface ParserRule {
  id: string;
  /** Cheap heuristic: does this rule know how to parse this document? */
  matches(pages: ExtractedPage[]): boolean;
  parse(pages: ExtractedPage[]): ParseResult;
}
