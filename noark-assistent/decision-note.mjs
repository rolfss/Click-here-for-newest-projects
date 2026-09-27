function location(record = {}) {
  return [
    record.section,
    record.page ? `side ${record.page}` : '',
    record.requirement ? `krav ${record.requirement}` : '',
  ].filter(Boolean).join(' · ');
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  return new Intl.DateTimeFormat('nb-NO', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export function buildDecisionNote(answer, { generatedAt = new Date() } = {}) {
  if (!answer || !String(answer.query ?? '').trim()) return '';

  const lines = [
    '# Beslutningsnotat – Noark 5-arkivassistent',
    '',
    `**Spørsmål:** ${answer.query}`,
    `**Kildedekning:** ${answer.confidence?.label ?? 'Ikke beregnet'}${Number.isFinite(answer.confidence?.score) ? ` (${answer.confidence.score}/100)` : ''}`,
    `**Generert:** ${formatDate(generatedAt)}`,
    '',
    '## Kort svar',
    `${answer.lead || 'Det foreligger ikke tilstrekkelig grunnlag for et kort svar.'} ${(answer.leadCitations ?? (answer.leadCitation ? [answer.leadCitation] : [])).map((n) => `[${n}]`).join(' ')}`,
  ];

  if (answer.points?.length) {
    lines.push('', '## Viktige punkter');
    for (const point of answer.points) lines.push(`- ${point.text} ${(point.citations ?? [point.citation]).map((n) => `[${n}]`).join(' ')}`);
  }

  if (answer.guidance) lines.push('', '## Forbehold og neste kontroll', answer.guidance);

  lines.push('', '## Kilder');
  if (!answer.results?.length) {
    lines.push('- Ingen sikre kildeposter ble funnet.');
  } else {
    for (const result of answer.results) {
      const sourceTitle = result.source?.title || result.source?.shortTitle || 'Kilde';
      const place = location(result.record);
      lines.push(`- [${result.rank}] ${sourceTitle}${place ? ` — ${place}` : ''}`);
      if (result.url) lines.push(`  ${result.url}`);
    }
  }

  lines.push(
    '',
    '## Beslutningsregel',
    'Dette notatet er fagstøtte. Kontroller ordlyden i originalkildene før juridiske, tekniske, anskaffelsesmessige eller operative beslutninger.',
    '',
    answer.mode === 'luna' ? 'Svar fra GPT-6 Luna (medium); notatet er satt sammen lokalt.' :
      answer.mode === 'bonsai' ? 'Svar fra Bonsai på eierens PC; notatet er satt sammen lokalt.' :
      'Generert lokalt i Noark 5-arkivassistenten.',
    ...(answer.retrieval?.method === 'jev' ? ['JEV valgte kildegrunnlaget. Dette er ikke en kontroll av påstandenes riktighet.'] : []),
  );

  return lines.join('\n');
}
