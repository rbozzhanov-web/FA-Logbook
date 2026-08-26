import { ParserRule } from '../types';
import { airAstanaCrewScheduleRule } from './airlines/airAstanaCrewSchedule';

/**
 * Rules in order of specificity. Only one format is understood so far — the crew schedule this
 * app was built to read — and there is deliberately no generic fallback: a roster that half-parses
 * into the wrong hours is worse than one the app admits it cannot read.
 */
export const parserRules: ParserRule[] = [airAstanaCrewScheduleRule];
