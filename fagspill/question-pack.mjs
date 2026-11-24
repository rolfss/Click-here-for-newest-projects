/**
 * Validate the source/question envelope used by the existing learning games.
 * Accepts JSON-compatible values, performs no I/O, and never changes the input.
 */
export function validateQuestionPack(pack) {
  const issues = [];
  const add = (code, path, message, row = null) => {
    issues.push({ code, path, row, message });
  };
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = value => typeof value === 'string' && value.trim().length > 0;

  if (!record(pack)) {
    add('invalid_pack', '$', 'Spørsmålspakken må være et objekt.');
    return { valid: false, issues };
  }

  const sourceIds = new Set();
  const duplicateSourceIds = new Set();
  if (!Array.isArray(pack.sources)) {
    add('invalid_sources', 'sources', 'Kilder må være en liste.');
  } else {
    if (pack.sources.length === 0) {
      add('empty_sources', 'sources', 'Spørsmålspakken må inneholde minst én kilde.');
    }
    for (let i = 0; i < pack.sources.length; i++) {
      const source = pack.sources[i];
      const path = `sources[${i}]`;
      const row = i + 1;
      if (!record(source)) {
        add('invalid_source', path, 'Kilden må være et objekt.', row);
        continue;
      }
      if (!text(source.id)) {
        add('invalid_source_id', `${path}.id`, 'Kilden må ha en ID som ikke er tom.', row);
      } else if (sourceIds.has(source.id)) {
        duplicateSourceIds.add(source.id);
        add('duplicate_source_id', `${path}.id`, 'Kilde-ID må være unik.', row);
      } else {
        sourceIds.add(source.id);
      }
      if (!text(source.title)) {
        add('invalid_source_title', `${path}.title`, 'Kilden må ha en tittel som ikke er tom.', row);
      }
      let validUrl = false;
      if (text(source.url) && !/[\u0000-\u0020\u007f]/u.test(source.url)) {
        try {
          const url = new URL(source.url);
          validUrl = ['http:', 'https:'].includes(url.protocol)
            && Boolean(url.hostname) && !url.username && !url.password;
        } catch {
          // Invalid URLs become validation issues; no network request is made.
        }
      }
      if (!validUrl) {
        add('invalid_source_url', `${path}.url`,
          'Kildelenken må være en fullstendig HTTP- eller HTTPS-adresse uten innlogging eller mellomrom.', row);
      }
    }
  }

  if (!Array.isArray(pack.questions)) {
    add('invalid_questions', 'questions', 'Spørsmål må være en liste.');
  } else {
    if (pack.questions.length === 0) {
      add('empty_questions', 'questions', 'Spørsmålspakken må inneholde minst ett spørsmål.');
    }
    const questionIds = new Set();
    for (let i = 0; i < pack.questions.length; i++) {
      const question = pack.questions[i];
      const path = `questions[${i}]`;
      const row = i + 1;
      if (!record(question)) {
        add('invalid_question', path, 'Spørsmålet må være et objekt.', row);
        continue;
      }
      if (!text(question.id)) {
        add('invalid_question_id', `${path}.id`, 'Spørsmålet må ha en ID som ikke er tom.', row);
      } else if (questionIds.has(question.id)) {
        add('duplicate_question_id', `${path}.id`, 'Spørsmåls-ID må være unik.', row);
      } else {
        questionIds.add(question.id);
      }
      if (!text(question.question)) {
        add('invalid_question_text', `${path}.question`, 'Spørsmålsteksten kan ikke være tom.', row);
      }
      if (!Array.isArray(question.options)) {
        add('invalid_options', `${path}.options`, 'Svaralternativene må være en liste.', row);
      } else {
        if (question.options.length < 2) {
          add('too_few_options', `${path}.options`, 'Spørsmålet må ha minst to svaralternativer.', row);
        }
        for (let option = 0; option < question.options.length; option++) {
          if (!text(question.options[option])) {
            add('invalid_option', `${path}.options[${option}]`, 'Svaralternativet må være tekst som ikke er tom.', row);
          }
        }
      }
      if (!Number.isInteger(question.correct)) {
        add('invalid_correct_index', `${path}.correct`, 'Riktig svar må angis som et heltall, fra 0.', row);
      } else if (!Array.isArray(question.options)
          || question.correct < 0 || question.correct >= question.options.length) {
        add('correct_index_out_of_range', `${path}.correct`, 'Riktig svar peker ikke på et eksisterende svaralternativ.', row);
      }
      if (!text(question.explanation)) {
        add('invalid_explanation', `${path}.explanation`, 'Spørsmålet må ha en forklaring som ikke er tom.', row);
      }
      if (!text(question.source)) {
        add('invalid_source_reference', `${path}.source`, 'Spørsmålet må vise til en kilde-ID.', row);
      } else if (!sourceIds.has(question.source)) {
        add('unknown_source', `${path}.source`, 'Spørsmålet viser til en kilde som ikke finnes i pakken.', row);
      } else if (duplicateSourceIds.has(question.source)) {
        add('ambiguous_source', `${path}.source`, 'Spørsmålets kilde-ID viser til flere kilder.', row);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}
