import { collectCrewNames, filterCrewNames, splitCrewList } from '../crewNames';

describe('reading a stored crew list', () => {
  it('splits an imported cabin crew list into individual names', () => {
    expect(splitCrewList('IS BORTSOVA NINA, PU ISKAKOVA GULSANA, FJ AKHMET NURALI')).toEqual([
      'BORTSOVA NINA',
      'ISKAKOVA GULSANA',
      'AKHMET NURALI',
    ]);
  });

  it('drops the deadhead tag along with the rank', () => {
    expect(splitCrewList('FJ (DHC) MAUT AISHA')).toEqual(['MAUT AISHA']);
  });

  it('leaves a hand-typed name alone', () => {
    expect(splitCrewList('Anna Chen')).toEqual(['Anna Chen']);
  });

  it('copes with nothing at all', () => {
    expect(splitCrewList(undefined)).toEqual([]);
    expect(splitCrewList('')).toEqual([]);
  });
});

describe('collecting the names already in the logbook', () => {
  it('offers the most-flown-with first', () => {
    const names = collectCrewNames([
      { captainName: 'SMITH JOHN', purserName: 'BROWN ANNA' },
      { captainName: 'SMITH JOHN', purserName: 'GREEN SAM' },
    ]);
    expect(names[0]).toBe('SMITH JOHN');
  });

  it('treats one person spelled two ways as one person, keeping the first spelling', () => {
    const names = collectCrewNames([{ captainName: 'SMITH JOHN' }, { captainName: 'Smith John' }]);
    expect(names).toEqual(['SMITH JOHN']);
  });

  it('does not offer a whole crew list back as a single suggestion', () => {
    const names = collectCrewNames([
      { otherCrewNames: 'IS BORTSOVA NINA, PU ISKAKOVA GULSANA' },
    ]);
    expect(names).toEqual(['BORTSOVA NINA', 'ISKAKOVA GULSANA']);
  });

  it('ignores empty columns, including SQLite nulls', () => {
    expect(collectCrewNames([{ captainName: null, purserName: '  ', otherCrewNames: undefined }])).toEqual([]);
  });
});

describe('suggesting a name for what has been typed', () => {
  const names = ['ALEXANDR KISSELEV', 'KISSELEV ALEXANDR', 'SMITH JOHN'];

  it('reaches a name by either of its words', () => {
    expect(filterCrewNames(names, 'KISS')).toEqual(['KISSELEV ALEXANDR', 'ALEXANDR KISSELEV']);
  });

  it('suggests nothing until typing starts', () => {
    expect(filterCrewNames(names, '')).toEqual([]);
  });

  it('does not repeat back a name already typed in full', () => {
    expect(filterCrewNames(names, 'SMITH JOHN')).toEqual([]);
  });
});
