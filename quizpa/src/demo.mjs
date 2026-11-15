export const demo = {
  title: 'Mysteriet på Fjordvik',
  description: 'Et fiktivt museum, fem spørsmål og én forsvunnet nøkkel.',
  questions: [
    {
      text: 'Tre nøkler har fargene rød, blå og grønn. Den røde passer i arkivet, den grønne i verkstedet. Hvilken passer i biblioteket?',
      options: ['Rød', 'Grønn', 'Blå', 'Det er umulig å si'],
      correct: 2, seconds: 25,
      explanation: 'Den blå er den eneste nøkkelen som ennå ikke har fått et rom.',
    },
    {
      text: 'Utstillingen åpner klokken 09.15 og omvisningen begynner 45 minutter senere. Når begynner omvisningen?',
      options: ['09.45', '10.00', '10.15', '10.30'],
      correct: 1, seconds: 20,
      explanation: '09.15 pluss 45 minutter er 10.00.',
    },
    {
      text: 'På nøkkellappen står «B, D, F, …». Hvilken bokstav fortsetter mønsteret?',
      options: ['G', 'H', 'I', 'J'],
      correct: 1, seconds: 20,
      explanation: 'Mønsteret hopper over én bokstav hver gang.',
    },
    {
      text: 'Alle skapene i museet har lås. Skap nummer fire er et av disse skapene. Har skap nummer fire lås?',
      options: ['Ja', 'Nei'],
      correct: 0, seconds: 15,
      explanation: 'Skap fire er omfattet av «alle skapene».',
    },
    {
      text: 'Nøkkelen ligger i en av fire skuffer. Skuff 1, 2 og 4 er tomme. Hvor ligger nøkkelen?',
      options: ['Skuff 1', 'Skuff 2', 'Skuff 3', 'Skuff 4'],
      correct: 2, seconds: 20,
      explanation: 'Skuff 3 er den eneste som ikke er tom.',
    },
  ],
};
