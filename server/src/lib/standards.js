/**
 * The Dynamic State-Compliance Engine catalog.
 *
 * Each supported state maps the five check-in mood scores (1..5) onto the
 * indicators of that state's official early-childhood SEL standards. A single
 * mood score may evidence more than one indicator, so the mapping is 1:N.
 *
 * `code` is the exact citation an administrator exports; `indicator` is the
 * standard's own indicator text, quoted closely enough to be recognizable in a
 * compliance review.
 */

export const SUPPORTED_STATES = /** @type {const} */ ([
  { code: 'NY', name: 'New York', framework: 'NYSPLS' },
  { code: 'NJ', name: 'New Jersey', framework: 'NJSLS Preschool Teaching & Learning Standards' },
  { code: 'CA', name: 'California', framework: 'CA Preschool Learning Foundations' },
  { code: 'FL', name: 'Florida', framework: 'FELDS (Three-Year-Old Standards)' },
  { code: 'GA', name: 'Georgia', framework: 'GELDS' },
]);

export const STATE_CODES = SUPPORTED_STATES.map((s) => s.code);

/** Canonical, child-facing meaning of each score. */
export const MOODS = [
  { score: 5, key: 'super_happy', label: 'Super Happy', bloom: 'sunflower' },
  { score: 4, key: 'happy_good', label: 'Happy & Good', bloom: 'sunflower' },
  { score: 3, key: 'just_okay', label: 'Just Okay', bloom: 'sprout' },
  { score: 2, key: 'tired_sleepy', label: 'Tired / Sleepy', bloom: 'bluebell' },
  { score: 1, key: 'sad_mad', label: 'Sad / Mad', bloom: 'bluebell' },
];

export const BLOOM_FOR_SCORE = Object.fromEntries(MOODS.map((m) => [m.score, m.bloom]));

/**
 * state -> score -> indicator rows.
 * @type {Record<string, Record<number, {code:string, domain:string, indicator:string}[]>>}
 */
export const STANDARDS = {
  NY: {
    5: [
      { code: 'NYSPLS D3.SA.1', domain: 'Domain 3: Social and Emotional Development — Self-Awareness',
        indicator: 'Demonstrates a positive sense of self and expresses confidence in own abilities and accomplishments.' },
      { code: 'NYSPLS D3.REL.1', domain: 'Domain 3: Social and Emotional Development — Relationships',
        indicator: 'Engages positively and enthusiastically with familiar adults and peers in shared routines.' },
    ],
    4: [
      { code: 'NYSPLS D3.SA.2', domain: 'Domain 3: Social and Emotional Development — Self-Awareness',
        indicator: 'Recognizes and names own emotions and communicates them to a familiar adult.' },
      { code: 'NYSPLS D3.REL.2', domain: 'Domain 3: Social and Emotional Development — Relationships',
        indicator: 'Participates cooperatively in group routines and sustains positive interactions with peers.' },
    ],
    3: [
      { code: 'NYSPLS D3.SA.2', domain: 'Domain 3: Social and Emotional Development — Self-Awareness',
        indicator: 'Recognizes and names own emotions and communicates them to a familiar adult.' },
      { code: 'NYSPLS D3.SR.1', domain: 'Domain 3: Social and Emotional Development — Self-Regulation',
        indicator: 'Manages transitions in the daily routine with growing independence.' },
    ],
    2: [
      { code: 'NYSPLS D3.SR.2', domain: 'Domain 3: Social and Emotional Development — Self-Regulation',
        indicator: 'Uses adult support and familiar strategies to regulate energy level, attention and emotion.' },
      { code: 'NYSPLS D3.SA.2', domain: 'Domain 3: Social and Emotional Development — Self-Awareness',
        indicator: 'Recognizes and names own emotions and communicates them to a familiar adult.' },
    ],
    1: [
      { code: 'NYSPLS D3.SR.3', domain: 'Domain 3: Social and Emotional Development — Self-Regulation',
        indicator: 'Expresses strong feelings such as anger or sadness in words rather than actions, with adult support.' },
      { code: 'NYSPLS D3.REL.3', domain: 'Domain 3: Social and Emotional Development — Relationships',
        indicator: 'Seeks comfort and help from a trusted adult when distressed.' },
    ],
  },
  NJ: {
    5: [
      { code: 'NJ 0.1.1', domain: 'Standard 0.1 — Self-Confidence',
        indicator: 'Demonstrates self-confidence and a positive attitude toward daily classroom activities.' },
      { code: 'NJ 0.5.1', domain: 'Standard 0.5 — Pro-Social Behaviors',
        indicator: 'Engages positively with peers and contributes to the classroom community.' },
    ],
    4: [
      { code: 'NJ 0.3.1', domain: 'Standard 0.3 — Identifying Feelings',
        indicator: 'Recognizes and identifies own emotions and the emotions of others.' },
      { code: 'NJ 0.1.2', domain: 'Standard 0.1 — Self-Confidence',
        indicator: 'Expresses satisfaction and pride in personal accomplishments.' },
    ],
    3: [
      { code: 'NJ 0.3.1', domain: 'Standard 0.3 — Identifying Feelings',
        indicator: 'Recognizes and identifies own emotions and the emotions of others.' },
      { code: 'NJ 0.2.1', domain: 'Standard 0.2 — Self-Direction',
        indicator: 'Demonstrates self-direction by beginning and completing a familiar task independently.' },
    ],
    2: [
      { code: 'NJ 0.2.2', domain: 'Standard 0.2 — Self-Direction',
        indicator: 'Attends to a task and manages own energy and attention with adult scaffolding.' },
      { code: 'NJ 0.3.2', domain: 'Standard 0.3 — Identifying Feelings',
        indicator: 'Communicates feelings and physical needs, such as tiredness, to a familiar adult.' },
    ],
    1: [
      { code: 'NJ 0.3.3', domain: 'Standard 0.3 — Identifying Feelings',
        indicator: 'Expresses a range of emotions, including frustration and sadness, in appropriate ways.' },
      { code: 'NJ 0.5.2', domain: 'Standard 0.5 — Pro-Social Behaviors',
        indicator: 'Seeks and accepts support from adults and peers when experiencing difficulty.' },
    ],
  },
  CA: {
    5: [
      { code: 'CA PLF SED 1.1', domain: 'Self-Awareness',
        indicator: 'Describes own physical characteristics, behavior and abilities positively.' },
      { code: 'CA PLF SED 3.1', domain: 'Cooperation',
        indicator: 'Participates cooperatively and enthusiastically in group activities and shared routines.' },
    ],
    4: [
      { code: 'CA PLF SED 1.2', domain: 'Self-Awareness',
        indicator: 'Identifies and communicates own emotions and needs with growing accuracy.' },
      { code: 'CA PLF SED 3.2', domain: 'Cooperation',
        indicator: 'Sustains positive interactions and joins peers in shared classroom activities.' },
    ],
    3: [
      { code: 'CA PLF SED 1.2', domain: 'Self-Awareness',
        indicator: 'Identifies and communicates own emotions and needs with growing accuracy.' },
      { code: 'CA PLF SED 2.1', domain: 'Self-Regulation',
        indicator: 'Moves through routine transitions with increasing independence.' },
    ],
    2: [
      { code: 'CA PLF SED 2.2', domain: 'Self-Regulation',
        indicator: 'Regulates attention, impulses and energy level with adult guidance and familiar supports.' },
      { code: 'CA PLF SED 1.2', domain: 'Self-Awareness',
        indicator: 'Identifies and communicates own emotions and needs with growing accuracy.' },
    ],
    1: [
      { code: 'CA PLF SED 2.3', domain: 'Self-Regulation',
        indicator: 'Uses words and adult-supported strategies to manage strong emotions such as anger or sadness.' },
      { code: 'CA PLF SED 3.3', domain: 'Cooperation',
        indicator: 'Seeks help from a familiar adult to resolve distress or conflict.' },
    ],
  },
  FL: {
    5: [
      { code: 'FELDS 3yo II.A.1', domain: 'Self-Concept',
        indicator: 'Shows confidence in own abilities and expresses pride in accomplishments.' },
      { code: 'FELDS 3yo II.D.1', domain: 'Pro-Social Behavior',
        indicator: 'Interacts positively with familiar peers and adults during daily routines.' },
    ],
    4: [
      { code: 'FELDS 3yo II.A.2', domain: 'Self-Concept',
        indicator: 'Expresses own emotions, preferences and needs with words, gestures or images.' },
      { code: 'FELDS 3yo II.C.1', domain: 'Approaches to Learning',
        indicator: 'Shows eagerness and curiosity as a learner during familiar classroom activities.' },
    ],
    3: [
      { code: 'FELDS 3yo II.A.2', domain: 'Self-Concept',
        indicator: 'Expresses own emotions, preferences and needs with words, gestures or images.' },
      { code: 'FELDS 3yo II.C.2', domain: 'Approaches to Learning',
        indicator: 'Participates in and completes a familiar routine with growing persistence.' },
    ],
    2: [
      { code: 'FELDS 3yo II.B.1', domain: 'Self-Regulation',
        indicator: 'Manages own energy, attention and behavior with adult support and predictable routines.' },
      { code: 'FELDS 3yo II.A.2', domain: 'Self-Concept',
        indicator: 'Expresses own emotions, preferences and needs with words, gestures or images.' },
    ],
    1: [
      { code: 'FELDS 3yo II.B.2', domain: 'Self-Regulation',
        indicator: 'Begins to use adult-supported strategies to calm down when upset or frustrated.' },
      { code: 'FELDS 3yo II.D.2', domain: 'Pro-Social Behavior',
        indicator: 'Seeks assistance and comfort from a trusted adult when needed.' },
    ],
  },
  GA: {
    5: [
      { code: 'GELDS SED1.4a', domain: 'SED1 — Sense of Self',
        indicator: 'Demonstrates a positive sense of self and confidence in own growing abilities.' },
      { code: 'GELDS SED5.4a', domain: 'SED5 — Peer Relationships',
        indicator: 'Initiates and sustains positive interactions with peers during group activities.' },
    ],
    4: [
      { code: 'GELDS SED2.4a', domain: 'SED2 — Self-Expression',
        indicator: 'Expresses and names a range of emotions appropriately.' },
      { code: 'GELDS SED1.4b', domain: 'SED1 — Sense of Self',
        indicator: 'Shows satisfaction and pride in own efforts and accomplishments.' },
    ],
    3: [
      { code: 'GELDS SED2.4a', domain: 'SED2 — Self-Expression',
        indicator: 'Expresses and names a range of emotions appropriately.' },
      { code: 'GELDS SED3.4a', domain: 'SED3 — Self-Control',
        indicator: 'Follows and moves through familiar classroom routines and transitions.' },
    ],
    2: [
      { code: 'GELDS SED3.4b', domain: 'SED3 — Self-Control',
        indicator: 'Regulates own attention, energy and behavior with adult guidance.' },
      { code: 'GELDS SED2.4b', domain: 'SED2 — Self-Expression',
        indicator: 'Communicates physical and emotional needs, such as tiredness, to a familiar adult.' },
    ],
    1: [
      { code: 'GELDS SED3.4c', domain: 'SED3 — Self-Control',
        indicator: 'Uses words, with adult support, to express anger, sadness or frustration.' },
      { code: 'GELDS SED5.4b', domain: 'SED5 — Peer Relationships',
        indicator: 'Seeks help from a trusted adult or peer when upset.' },
    ],
  },
};
