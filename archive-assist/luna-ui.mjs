const $ = selector => document.querySelector(selector);

function rewriteLunaUi() {
  const heading = $('#ai-heading');
  const copy = $('#ai-copy');
  const allButton = $('#run-all-ai');
  const fileButton = $('#run-file-ai');
  const fileStatus = $('#ai-file-status');
  const method = $('#title-method');
  const status = $('#status');

  if (heading) heading.textContent = 'GPT-6 Luna';
  if (copy) {
    copy.textContent = allButton?.hidden
      ? 'Reasoning effort: medium. Luna er ikke tilgjengelig nå; lokale metadataforslag virker fortsatt.'
      : 'Reasoning effort: medium. Luna brukes bare når du velger det; et begrenset tekstutdrag og relevante metadata sendes via sikker backend.';
  }

  if (allButton) {
    if (/arbeider|analyserer/i.test(allButton.textContent)) {
      allButton.textContent = allButton.textContent.replace(/Lokal AI arbeider/i, 'Luna analyserer');
    } else {
      allButton.textContent = 'Forbedre alle med Luna';
    }
  }

  if (fileButton) {
    fileButton.textContent = /analyserer|klargjør/i.test(fileButton.textContent)
      ? 'Luna analyserer …'
      : 'Forbedre med Luna';
  }

  if (fileStatus) {
    if (fileStatus.textContent.includes('behandles lokalt på enheten')) {
      fileStatus.textContent = 'Et begrenset tekstutdrag og relevante metadata analyseres med GPT-6 Luna.';
    } else if (fileStatus.textContent.includes('Fullført lokalt')) {
      fileStatus.textContent = fileStatus.textContent.replace('Fullført lokalt', 'Fullført med GPT-6 Luna');
    } else if (fileStatus.textContent.includes('Analyserer lokalt')) {
      fileStatus.textContent = fileStatus.textContent.replace('Analyserer lokalt', 'Analyserer med GPT-6 Luna');
    }
  }
  if (method?.textContent === 'Lokal nettleser-AI') method.textContent = 'GPT-6 Luna · reasoning medium';
  if (status?.textContent.includes('forbedret med lokal AI')) {
    status.textContent = status.textContent.replace('forbedret med lokal AI', 'forbedret med GPT-6 Luna');
  }
}

let scheduled = false;
const observer = new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    observer.disconnect();
    rewriteLunaUi();
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  });
});

rewriteLunaUi();
observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
