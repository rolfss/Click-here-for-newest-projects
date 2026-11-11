import { CONFERENCE_API_URL } from './conference-config.js';
import { conferenceApiEndpoint, formatConferencePoints } from './conference-standings.js';
import { cleanName } from './rally-rules.js?v=3.2.0';
import { RUN_BOARD } from './run-scoring.js';

export const conferenceSettings = Object.freeze({ quiz: true, assist: true, mobileHelp: true, autogas: false });

export function readConferenceDriver(nickname, username, confirmation) {
  if (typeof username !== 'string' || !/^[A-Za-z0-9'.!#^_~-]{1,64}$/.test(username) || username.endsWith('.')) {
    throw Error('Skriv det korte brukernavnet, for eksempel kari.nordmann. Brukernavnet kan ikke inneholde @ eller mellomrom.');
  }
  if (username !== confirmation) {
    throw Error('Brukernavnene er ulike. Sammenlign dem med jobbkontoen din og rett begge feltene før du starter.');
  }
  return { nickname: cleanName(nickname), username };
}

class ScoreRequestError extends Error {
  constructor(status) {
    super(`Poengtjenesten svarte med ${status}.`);
    this.status = status;
  }
}

async function send(path, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const endpoint = conferenceApiEndpoint(CONFERENCE_API_URL, `conference/${path}`);
    endpoint.searchParams.set('board', RUN_BOARD);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
    });
    if (!response.ok) throw new ScoreRequestError(response.status);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function createConferenceRace({ openModal, eligible }) {
  let driver;
  let ticket;

  function display() {
    openModal('Dagens poengtavle', '<iframe id="conference-board-frame" src="./conference-leaderboard.html" title="Dagens FJORDSPRINT-poengtavle"></iframe>');
  }

  function askDriver(onReady, start) {
    openModal('Meld deg på konferanseløpet', `
      <form id="conference-driver-form" novalidate>
        <label for="conference-nickname">Kallenavn på poengtavlen</label>
        <input id="conference-nickname" name="nickname" autocomplete="nickname" maxlength="20" required>
        <div id="conference-username-help" class="conference-username-help">
          <h3>Skriv M365-brukernavnet ditt nøyaktig</h3>
          <p>Bruk det korte brukernavnet for jobbkontoen din, for eksempel <strong>kari.nordmann</strong>. Sjekk alle bokstaver, tall og tegn mot jobbkontoen din.</p>
          <p><strong>Hvis du vinner, kan vi bare kontakte deg om premien hvis brukernavnet samsvarer nøyaktig med jobbkontoen din.</strong></p>
          <p>Bare arrangøren kan se brukernavnet. På poengtavlen vises kallenavnet ditt sammen med poengsummen.</p>
        </div>
        <label for="conference-username">Kort M365-brukernavn</label>
        <input id="conference-username" name="username" aria-describedby="conference-username-help" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" required>
        <label for="conference-confirmation">Skriv brukernavnet en gang til</label>
        <input id="conference-confirmation" name="confirmation" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" required>
        <p class="conference-form-message" role="alert"></p>
        <button class="primary" type="submit">${start ? 'KLAR TIL START →' : 'LAGRE FØRER'}</button>
      </form>`);
    const form = document.getElementById('conference-driver-form');
    const message = form.querySelector('.conference-form-message');
    const button = form.querySelector('button');
    form.addEventListener('input', () => { if (!button.disabled) message.textContent = ''; });
    form.elements.nickname.focus();
    form.onsubmit = event => {
      event.preventDefault();
      let participant;
      try {
        participant = readConferenceDriver(form.elements.nickname.value, form.elements.username.value, form.elements.confirmation.value);
      } catch (error) {
        message.textContent = error.message;
        return;
      }
      if (start) issueTicket(participant, onReady, message, button);
      else {
        driver = participant;
        onReady();
      }
    };
  }

  async function issueTicket(participant, onReady, message, button) {
    button.disabled = true;
    message.textContent = 'Kobler til poengtavlen …';
    let raceTicket;
    try {
      raceTicket = (await send('sessions', { board: RUN_BOARD, ...participant })).ticket;
      if (typeof raceTicket !== 'string' || !raceTicket) throw Error('Mangler løpsbillett.');
    } catch (error) {
      message.textContent = error.status === 429 ? 'For mange startforsøk. Vent litt og prøv igjen.' : 'Kunne ikke starte et tellende løp. Sjekk nettet og prøv igjen.';
      button.disabled = false;
      return;
    }
    if (!message.isConnected || message.closest('.hidden')) return;
    driver = participant;
    ticket = raceTicket;
    onReady();
  }

  function requestStart(onReady) {
    if (!CONFERENCE_API_URL) {
      openModal('Poengtavlen er ikke koblet til', '<p>Arrangøren må aktivere poengtjenesten før konferanseløpet kan starte.</p>');
      return;
    }
    if (!eligible()) {
      openModal('Åpne løpet på mobilen', '<p>Skann konferansens QR-kode med mobilen for å kjøre de tre etappene med mobilhjelp.</p>');
      return;
    }
    if (!driver) {
      askDriver(onReady, true);
      return;
    }
    openModal('Klar til nytt løp', '<p id="conference-start-message" role="status"></p><button id="conference-start-retry" class="primary" type="button">Prøv igjen</button>');
    const message = document.getElementById('conference-start-message');
    const button = document.getElementById('conference-start-retry');
    button.onclick = () => issueTicket(driver, onReady, message, button);
    button.click();
  }

  function begin() {
    document.getElementById('score-entry').classList.add('hidden');
    document.getElementById('pilot-name').textContent = driver.nickname;
  }

  function submitRun(stages, summary, { status, retry }) {
    const run = { ticket, stages: [...stages] };
    ticket = undefined;
    let retries = 0;
    async function submit() {
      retry.hidden = true;
      status.textContent = 'Sender poengene fra alle tre etappene …';
      try {
        const { score } = await send('scores', run);
        if (score?.score !== summary.score || score.timeMs !== summary.timeMs ||
            score.stages?.length !== summary.stages.length ||
            score.stages.some((stage, index) => stage.score !== summary.stages[index].score)) {
          status.textContent = 'Poengtjenesten bekreftet et annet resultat. Åpne poengtavlen for å se hva som er lagret.';
          return;
        }
        status.textContent = `${formatConferencePoints(score.score)} poeng er registrert. Din beste runde vises på poengtavlen.`;
      } catch (error) {
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
          status.textContent = 'Resultatet ble avvist. Start et nytt konferanseløp for å få et tellende resultat.';
        } else if (retries < 2) {
          retries++;
          status.textContent = 'Mistet kontakten med poengtavlen. La siden stå åpen mens vi prøver igjen.';
          setTimeout(submit, retries * 2000);
        } else {
          status.textContent = 'Resultatet venter. Sjekk nettet og trykk «Send på nytt».';
          retry.hidden = false;
        }
      }
    }
    retry.onclick = () => { retries = 0; submit(); };
    submit();
  }

  return { begin, submitRun, display, requestStart, changeDriver: onReady => askDriver(onReady, false) };
}
