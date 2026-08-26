import { EMPTY_FORM_VALUES, EntryFormValues, entryFormSchema, formValuesToEntry } from '../formSchema';

function values(overrides: Partial<EntryFormValues>): EntryFormValues {
  return { ...EMPTY_FORM_VALUES, date: '2026-07-20', ...overrides };
}

describe('an absence in the manual entry form', () => {
  it('is valid with no station at all, as long as it carries a duty code', () => {
    const result = entryFormSchema.safeParse(
      values({ kind: 'absence', dutyCode: 'SICK', departureAirport: '', arrivalAirport: '' }),
    );
    expect(result.success).toBe(true);
  });

  it('is rejected without a duty code — SICK or UFF has to be picked', () => {
    const result = entryFormSchema.safeParse(
      values({ kind: 'absence', dutyCode: '', departureAirport: '', arrivalAirport: '' }),
    );
    expect(result.success).toBe(false);
  });

  it('turns into an entry with every hour field zeroed, and the duty code preserved', () => {
    const entry = formValuesToEntry(
      values({ kind: 'absence', dutyCode: 'uff', departureAirport: '', arrivalAirport: '' }),
    );
    expect(entry.blockMinutes).toBe(0);
    expect(entry.deadheadMinutes).toBe(0);
    expect(entry.groundDutyMinutes).toBe(0);
    expect(entry.dutyCode).toBe('UFF');
  });
});

describe('a sector still requires a real station', () => {
  it('rejects an empty departure airport for an operating sector', () => {
    const result = entryFormSchema.safeParse(
      values({ kind: 'operating', departureAirport: '', arrivalAirport: 'NQZ', blockTime: '01:30' }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts a complete operating sector', () => {
    const result = entryFormSchema.safeParse(
      values({ kind: 'operating', departureAirport: 'ALA', arrivalAirport: 'NQZ', blockTime: '01:30' }),
    );
    expect(result.success).toBe(true);
  });
});
