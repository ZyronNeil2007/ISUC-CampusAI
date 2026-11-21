import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, analyzeQuery, normalizeText, rawTokens, stem, STEM_FIXUPS, STOPWORDS } from '../../src/ai/retrieval/tokenizer.js';

test('normalizeText lowercases, strips accents and unifies quotes and dashes', () => {
  assert.equal(normalizeText('Café Registrar’s Office – Main'), "cafe registrar's office - main");
  assert.equal(normalizeText('ÑANDÚ'), 'nandu');
  assert.equal(normalizeText(null), '');
  assert.equal(normalizeText(undefined), '');
});

test('rawTokens drops possessives and apostrophes and splits on punctuation', () => {
  assert.deepEqual(rawTokens("Registrar's Office"), ['registrar', 'office']);
  assert.deepEqual(rawTokens('Form 137 / SF10, TOR!'), ['form', '137', 'sf10', 'tor']);
  assert.deepEqual(rawTokens("don't"), ['do', 'not']);
  assert.deepEqual(rawTokens('mag-enroll'), ['mag', 'enroll']);
  assert.deepEqual(rawTokens('   '), []);
});

test('stemming conflates the word forms students and documents use interchangeably', () => {
  const groups = [
    ['enroll', 'enrolled', 'enrolling', 'enrolls', 'enrollment'],
    ['apply', 'applying', 'applied', 'applies', 'application', 'applications', 'applicant', 'applicants'],
    ['require', 'required', 'requires', 'requirement', 'requirements'],
    ['register', 'registered', 'registering', 'registration'],
    ['admit', 'admitted', 'admission', 'admissions'],
    ['scholar', 'scholarship', 'scholarships'],
    ['pay', 'paying', 'paid', 'payment', 'payments', 'payable'],
    ['submit', 'submitted', 'submitting', 'submission'],
    ['certify', 'certified', 'certificate', 'certification'],
    ['transfer', 'transferred', 'transferee', 'transferees'],
    ['withdraw', 'withdrawn', 'withdrawal', 'withdrew'],
    ['clear', 'cleared', 'clearance'],
    ['exam', 'exams', 'examination', 'examinations', 'examine'],
    ['expire', 'expired', 'expiry', 'expiration'],
    ['verify', 'verified', 'verification'],
    ['lose', 'lost', 'loss'],
    ['employ', 'employment', 'employee', 'employees'],
    ['advise', 'adviser', 'advisor'],
    ['inquire', 'inquiry', 'inquiries', 'enquiry'],
    ['dormitory', 'dormitories', 'dorm', 'dorms'],
    ['suspend', 'suspension'],
    ['extend', 'extension'],
    ['permit', 'permission'],
    ['behave', 'behavior', 'behaviour'],
    ['sign', 'signature', 'signatures'],
  ];
  for (const group of groups) {
    const stems = new Set(group.map(stem));
    assert.equal(stems.size, 1, `expected ${group.join(', ')} to share one stem, got ${[...stems].join(', ')}`);
  }
});

test('words that mean different things on a campus are NOT merged', () => {
  const different = [
    ['office', 'official'],
    ['registrar', 'register'],
    ['guidance', 'guide'],
    ['director', 'direct'],
    ['receipt', 'receive'],
    ['teacher', 'teach'],
    ['transcript', 'transfer'],
    ['graduate', 'grade'],
  ];
  for (const [a, b] of different) assert.notEqual(stem(a), stem(b), `${a} and ${b} must stay separate`);
});

test('the fix-up table has no chains and every key really is a Porter stem that is being redirected', () => {
  const keys = new Set(Object.keys(STEM_FIXUPS));
  for (const [from, to] of Object.entries(STEM_FIXUPS)) {
    assert.ok(!keys.has(to), `${from} -> ${to} chains into another fix-up`);
    assert.notEqual(from, to);
  }
});

test('stemming leaves tokens containing digits alone', () => {
  assert.equal(stem('form137'), 'form137');
  assert.equal(stem('2026'), '2026');
  assert.equal(stem('sf10'), 'sf10');
});

test('analyze removes stopwords, filler and single letters', () => {
  assert.deepEqual(analyze('How do I enroll?'), ['enrol']);
  assert.deepEqual(analyze('Please tell me what the requirements are'), ['requir']);
  assert.deepEqual(analyze('a b c enroll'), ['enrol']);
  assert.deepEqual(analyze(''), []);
});

test('analyze keeps repeats (term frequency matters to BM25)', () => {
  assert.deepEqual(analyze('fee fee fees'), ['fee', 'fee', 'fee']);
});

test('analyze can keep stopwords when asked', () => {
  assert.ok(analyze('how to enroll', { keepStopwords: true }).includes('how'));
});

test('stopword list covers English and Filipino filler', () => {
  for (const w of ['the', 'how', 'please', 'paano', 'ano', 'sa', 'po', 'ng', 'kailangan', 'mag']) {
    assert.ok(STOPWORDS.has(w), `${w} should be a stopword`);
  }
  // Content words must not be swallowed.
  for (const w of ['enroll', 'fee', 'office', 'scholarship', 'registrar', 'library', 'may', 'march', 'id']) {
    assert.ok(!STOPWORDS.has(w), `${w} must not be a stopword`);
  }
});

test('"May" survives analysis so questions about the month can match', () => {
  assert.deepEqual(analyze('What is due in May?'), ['due', stem('may')]);
  assert.deepEqual(analyze('Enrollment ends May 30'), ['enrol', 'end', stem('may'), '30']);
});

test('"what happens if..." is question filler, not a topic', () => {
  assert.deepEqual(analyze('What happens if I get an INC?'), ['inc']);
  assert.deepEqual(analyze('What happened to my application?'), [stem('application')]);
  assert.deepEqual(analyze('What happens if I am caught cheating?'), ['caught', 'cheat']);
});

test('contractions leave no stray tokens', () => {
  assert.deepEqual(analyze("I'm a freshman, how do I enroll?"), ['freshman', 'enrol']);
  assert.deepEqual(analyze("I'd like to know what's required and don't know where"), ['requir']);
  assert.deepEqual(analyze("I'd pay the registrar's fee, it's due, we're late"), ['pay', 'registrar', 'fee', 'due', 'late']);
  assert.deepEqual(rawTokens("can't won't isn't"), ['can', 'not', 'will', 'not', 'is', 'not']);
  assert.deepEqual(rawTokens("student's O'Brien"), ['student', 'obrien']);
});

test('spellings that differ only by a hyphen are unified', () => {
  assert.deepEqual(analyze('e-mail and E-Mails'), ['email', 'email']);
  assert.deepEqual(analyze('Wi-Fi wifi'), ['wifi', 'wifi']);
});

test('a Filipino-English question reduces to its content words', () => {
  assert.deepEqual(analyze('Paano po mag-enroll sa ISU Cabagan?'), ['enrol', 'isu', 'cabagan']);
  assert.deepEqual(analyze('Ano ang kailangan para sa scholarship?'), ['scholar']);
});

test('analyzeQuery: original terms are weight 1, deduplicated and ordered', () => {
  const q = analyzeQuery('How do I enroll? Enrolling is easy.');
  assert.deepEqual(q.originals, ['enrol', 'easi']);
  assert.equal(q.terms.get('enrol'), 1);
  assert.equal(q.alternatives.size, 0);
});

test('analyzeQuery expands an acronym to its long form at lower weight', () => {
  const groups = [['tor', 'transcript of records']];
  const q = analyzeQuery('How do I request my TOR?', groups);
  assert.equal(q.terms.get('tor'), 1);
  assert.equal(q.terms.get('transcript'), 0.6);
  assert.equal(q.terms.get('record'), 0.6);
  // Originals do not include alias terms (they measure how much of the question is covered).
  assert.deepEqual(q.originals, ['request', 'tor']);
  // The acronym can be satisfied by the long form.
  assert.deepEqual(q.alternatives.get('tor'), [['transcript', 'record']]);
});

test('analyzeQuery expands the long form back to the acronym', () => {
  const groups = [['tor', 'transcript of records']];
  const q = analyzeQuery('transcript of records request', groups);
  assert.equal(q.terms.get('tor'), 0.6);
  assert.equal(q.terms.get('transcript'), 1);
});

test('analyzeQuery matches alias phrases on stemmed contiguous tokens', () => {
  const groups = [['good moral', 'certificate of good moral character']];
  assert.ok(analyzeQuery('where to get certificate of good moral character', groups).terms.has('good'));
  const q = analyzeQuery('a moral good story', groups); // words present but not contiguous
  assert.equal(q.alternatives.size, 0);
});

test('analyzeQuery never overwrites an original term with a lower alias weight', () => {
  const groups = [['tor', 'transcript of records']];
  const q = analyzeQuery('tor transcript records', groups);
  assert.equal(q.terms.get('transcript'), 1);
  assert.equal(q.terms.get('record'), 1);
});

test('analyzeQuery handles empty input and empty alias groups', () => {
  const q = analyzeQuery('', [[], ['x']]);
  assert.equal(q.terms.size, 0);
  assert.deepEqual(q.originals, []);
});

test('query and document analysis agree on the same words', () => {
  const doc = analyze('Students must submit the enrollment requirements to the Registrar.');
  const query = analyzeQuery('What requirements should I submit to enroll at the registrar?');
  for (const term of query.originals) assert.ok(doc.includes(term), `${term} should be in the document terms`);
});
