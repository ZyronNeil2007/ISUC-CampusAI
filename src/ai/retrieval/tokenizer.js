import { stemmer } from 'stemmer';

/**
 * Text analysis shared by indexing and querying, so both sides always agree.
 * Bump ANALYZER_VERSION whenever tokenization changes: any stored or prebuilt index must be rebuilt.
 */
export const ANALYZER_VERSION = 1;

// Function words, chat filler and question filler ("how much", "what is available"). Words that no document contains
// but that students use around every topic must be here, or they make a well-covered question look unanswerable.
// Keep it to words with no topical meaning: over-pruning hurts recall on short questions.
const ENGLISH_STOPWORDS = `a about above after again all also am an and any are as at be because been before being
below between both but by can could did do does doing down during each few for from further get got had has have
having he her here hers him his how i if in into is it its just me might more most must my need no nor not now
of off on once only or other our ours out over own same she should so some such than that the their theirs them then
there these they this those through to too under until up very was we were what when where which while who whom why
will with would you your yours please pls plz thanks thank hello hi hey kindly tell give want help
much many often soon long available possible info information regarding concerning related per any anything something
everything thing things kind kinds really actually exactly currently usually normally still already yet ever whether
go going goes needed needs wanted wants ask asked asking know find look looking like mean happen happens happened
happening`.split(/\s+/);

// Common Filipino function and question words, so Filipino or mixed-language questions are not drowned in filler.
const FILIPINO_STOPWORDS = `ang ng sa ay na at mga po opo ba ko mo ako ikaw ka siya kami tayo kayo sila namin natin nila niya ninyo
akin amin atin kanila kanya sakin sayo ito iyan iyon yung ung yun nito nyan noon dito doon dun yan para kung kapag
paano pano ano saan kailan sino bakit magkano naman lang din rin pa pwede puwede kailangan gusto nais sana dapat
kasi kaya pero nang daw raw nga muna talaga hindi di wala meron mayroon ni kay kina si sina mag nag pag`.split(/\s+/);

export const STOPWORDS = new Set([...ENGLISH_STOPWORDS, ...FILIPINO_STOPWORDS]);

/** Lowercase, strip accents, unify quotes and dashes, and join spellings that differ only by a hyphen. */
export function normalizeText(input) {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[–—−]/g, '-')
    .replace(/\be-mail(s?)\b/g, 'email$1')
    .replace(/\bwi-fi\b/g, 'wifi');
}

/**
 * Word tokens with no stopword removal or stemming.
 * Contractions are expanded or dropped so "I'm" and "don't" leave no stray tokens behind
 * ("im", "don") that no document contains and that would look like unanswerable content.
 */
export function rawTokens(text) {
  return normalizeText(text)
    .replace(/\bcan't\b/g, 'can not')
    .replace(/\bwon't\b/g, 'will not')
    .replace(/n't\b/g, ' not')
    .replace(/'(?:s|d|ll|m|re|ve)\b/g, '')
    .replace(/'/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const isNoise = (token) => token.length === 1 && /[a-z]/.test(token);

/**
 * Porter splits some word families that students treat as one ("pay" / "payment", "register" / "registration"),
 * and students ask in verbs while documents are written in nouns. This table folds those splits back together.
 * Keys and values are Porter stems, and no value is also a key (no chains).
 *
 * Deliberately NOT merged, because they mean different things on a campus: office/official,
 * guidance/guide, registrar/register (an office versus an action), director/direct, receipt/receive.
 * Extend this when tools/eval-retrieval.mjs shows a miss caused by a split; add a test for each new pair.
 */
export const STEM_FIXUPS = Object.freeze({
  registr: 'regist', // register, registration
  applic: 'appli', // apply, application, applicant
  reappli: 'appli',
  reapplic: 'appli',
  admiss: 'admit', // admit, admission
  admitt: 'admit',
  readmiss: 'readmit',
  certifi: 'certif', // certify, certificate, certification
  pai: 'pay', // pay, paying, paid, payment, payable
  paid: 'pay',
  payment: 'pay',
  payabl: 'pay',
  transfere: 'transfer', // transferee
  withdrawn: 'withdraw',
  withdrew: 'withdraw',
  clearanc: 'clear', // clearance
  submiss: 'submit', // submission
  qualifi: 'qualif', // qualify, qualification
  verifi: 'verif', // verify, verification
  notifi: 'notif', // notify, notification
  suspens: 'suspend', // suspension
  extens: 'extend', // extension
  mainten: 'maintain', // maintenance
  permiss: 'permit', // permission
  expiri: 'expir', // expiry
  exam: 'examin', // exam, examination
  inquiri: 'inquir', // inquire, inquiry
  enquir: 'inquir',
  enquiri: 'inquir',
  emploi: 'employ', // employ, employment, employee
  employe: 'employ',
  signatur: 'sign', // sign, signature
  behavior: 'behav', // behave, behavior
  behaviour: 'behav',
  lost: 'lose', // lose, lost, loss
  loss: 'lose',
  traine: 'train', // trainee
  grante: 'grant', // grantee
  telephon: 'phone',
  shifter: 'shift',
  failur: 'fail', // fail, failure
  deferr: 'defer', // deferral
  waiver: 'waiv', // waive, waiver
  scholarship: 'scholar',
  dorm: 'dormitori', // dormitory
  honour: 'honor',
  identif: 'identifi', // identify, identification
  licensur: 'licens', // license, licensure
  internship: 'intern',
  disciplinari: 'disciplin', // discipline, disciplinary
  advisor: 'advis', // advise, adviser, advisor
  advisori: 'advis',
  counselor: 'counsel',
  counsellor: 'counsel',
  curricula: 'curriculum',
  curricular: 'curriculum',
  organiz: 'organ', // organize, organization
  organis: 'organ',
  defens: 'defend', // defend, defense
  defenc: 'defend',
  competit: 'compet', // compete, competition
  recognit: 'recogn', // recognize, recognition
  retent: 'retain', // retain, retention
  probationari: 'probat',
  absent: 'absenc', // absent, absence
  healthi: 'health',
  safeti: 'safe',
  these: 'thesi', // thesis, theses
});

const FIXUPS = new Map(Object.entries(STEM_FIXUPS));

/** Porter-stem a word, then fold known split word families together. Tokens with digits (form137, 2026) are left alone. */
export function stem(token) {
  if (/\d/.test(token)) return token;
  const stemmed = stemmer(token);
  return FIXUPS.get(stemmed) ?? stemmed;
}

/** Index-time and query-time analysis: tokens -> stopword removal -> stemming. Repeats are kept. */
export function analyze(text, { keepStopwords = false } = {}) {
  const out = [];
  for (const token of rawTokens(text)) {
    if (!keepStopwords && STOPWORDS.has(token)) continue;
    if (isNoise(token)) continue;
    out.push(stem(token));
  }
  return out;
}

const unique = (arr) => [...new Set(arr)];

/** Does the list `haystack` contain `needle` as a contiguous run? */
export function containsSequence(haystack, needle) {
  if (!needle.length || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Analyze a question and expand known aliases.
 *
 * aliasGroups: arrays of equivalent phrases, e.g. ["tor", "transcript of records"]. When the question contains
 * one phrase (as a run of content words), the other phrases' terms are added at a lower weight.
 *
 * Returns:
 *   terms        Map term -> weight, used for scoring (aliases included at aliasWeight)
 *   originals    the question's own terms in order, without aliases (used to measure how much of the
 *                question a passage covers)
 *   alternatives Map original term -> arrays of terms that together can stand in for it
 *                (so a passage that says "transcript of records" counts as covering a question that says "TOR")
 */
export function analyzeQuery(text, aliasGroups = [], { aliasWeight = 0.6 } = {}) {
  const raw = rawTokens(text);
  // Alias phrases are matched on content words only (stopwords and single letters removed), so the alias
  // "drop a subject" also matches "drop my subject" and "transcript of records" matches "transcript records".
  const contentStemmed = analyze(text);
  const terms = new Map();
  const originals = [];

  for (const token of raw) {
    if (STOPWORDS.has(token) || isNoise(token)) continue;
    const term = stem(token);
    if (!terms.has(term)) {
      terms.set(term, 1);
      originals.push(term);
    }
  }

  const alternatives = new Map();
  for (const group of aliasGroups) {
    const members = group.map((phrase) => {
      const phraseTerms = analyze(phrase);
      return { stemmed: phraseTerms, terms: unique(phraseTerms) };
    });
    members.forEach((member, i) => {
      if (!containsSequence(contentStemmed, member.stemmed)) return;
      members.forEach((other, j) => {
        if (i === j || other.terms.length === 0) return;
        for (const t of other.terms) if (!terms.has(t)) terms.set(t, aliasWeight);
        for (const t of member.terms) {
          if (!alternatives.has(t)) alternatives.set(t, []);
          alternatives.get(t).push(other.terms);
        }
      });
    });
  }
  return { terms, originals, alternatives, raw };
}
