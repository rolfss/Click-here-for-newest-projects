import data from '../cases/investigation.json';
import './investigation.css';
import {CASE_STORAGE, freshCase, restoreCase, collectEvidence, roomEvidence, workSummary, caseReport} from './investigation-state';
import type {CaseState} from './investigation-state';
import type {MuseumWorld} from './world';
import type {InvestigationWorld} from './investigation-world';

type Hooks = {
  dialog: (title: string, html: string) => void; close: () => void;
  visit: (id: string) => Promise<void>; read: (id: string) => Promise<void>;
  announce: (text: string) => void; sound: () => boolean; volume: () => number;
};
type Route = 'brief' | 'board' | 'room' | 'evidence' | 'triage' | 'access' | 'crisis' | 'ending' | 'secret';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]!));
const button = (action: string, text: string, value = '', extra = '') => `<button type="button" data-c17="${action}" data-value="${esc(value)}" ${extra}>${text}</button>`;
const triageOptions = [['capture', 'Fang opp i dokumentasjonsflyten'], ['review', 'Avklar status og sammenheng'], ['duplicate', 'Kontrollert dobbeltkopi'], ['outside', 'Utenfor saken']];
const accessOptions = [['release', 'Gi innsyn i hele dokumentet'], ['redact', 'Gi innsyn med avgrenset sladding'], ['review', 'Avklar grunnlaget før avgjørelse']];

export class Investigation {
  state: CaseState = freshCase();
  storageAvailable = true;
  private scenery: InvestigationWorld | null = null;
  private world: MuseumWorld | null = null;
  private route: Route = 'brief';
  private value = '';
  private index = 0;
  private room: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private remaining = 30000;
  private deadline = 0;
  private audio: AudioContext | null = null;
  private root: HTMLElement;
  private openButton: HTMLButtonElement;
  private roomButton: HTMLButtonElement;

  constructor(private hooks: Hooks) {
    try {this.state = restoreCase(localStorage.getItem(CASE_STORAGE));} catch {this.storageAvailable = false;}
    this.root = document.querySelector('#dialog-body')!;
    this.openButton = document.createElement('button');this.openButton.id = 'case17-open';
    document.querySelector('#visit-optional')!.append(this.openButton);
    this.openButton.onclick = () => this.show(this.state.started ? 'board' : 'brief');
    this.roomButton = document.createElement('button');this.roomButton.id = 'case17-room';
    document.querySelector('#visit-optional')!.append(this.roomButton);
    this.roomButton.onclick = () => {if (this.room) this.show(this.room === 'leader' ? 'ending' : 'room', this.room);};
    this.root.addEventListener('click', event => {
      const el = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-c17]');
      if (el && this.root.contains(el)) this.act(el.dataset.c17!, el.dataset.value ?? '');
    });
    const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
    const stop = () => {this.pauseClock();this.stopVoice();};
    // Native close events are queued; pause at the closing gesture, not a later frame.
    document.querySelector('#dialog-close')!.addEventListener('click', stop, true);
    dialog.addEventListener('cancel', stop, true);
    dialog.addEventListener('close', stop);
    dialog.addEventListener('click', event => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom)) stop();
    }, true);
    new MutationObserver(() => {if (!dialog.open) stop();}).observe(dialog, {attributes: true, attributeFilter: ['open']});
    document.addEventListener('visibilitychange', () => {if (document.hidden) {this.pauseClock();this.stopVoice();}});
    window.addEventListener('blur', () => {this.pauseClock();this.stopVoice();});
    window.addEventListener('keydown', event => {
      if (event.code !== 'KeyF' || event.repeat || !this.world?.active || this.world.paused ||
        (event.target as HTMLElement).closest('input,textarea,select,button,[contenteditable]')) return;
      if (this.world.nearest) {event.preventDefault();this.show(this.world.nearest === 'leader' ? 'ending' : 'room', this.world.nearest);}
    });
    this.update();
    Object.defineProperty(window, 'museumCaseDiagnostics', {value: () => ({version: 1, found: [...this.state.found],
      summary: this.summary(), storageAvailable: this.storageAvailable, running: this.timer !== null,
      remaining: this.remaining, scenery: !!this.scenery}), writable: false});
  }
  async attachWorld(world: MuseumWorld) {
    this.world = world;
    const {InvestigationWorld} = await import('./investigation-world');
    this.scenery = new InvestigationWorld(world, id => this.show('room', id), () => this.show('secret'));
    const old = world.onNear;
    world.onNear = id => {old(id);this.room = id;this.update();};
    this.update();
  }
  private summary() {return workSummary(this.state, data.triage, data.access);}
  private save() {
    try {localStorage.setItem(CASE_STORAGE, JSON.stringify(this.state));} catch {this.storageAvailable = false;}
    this.update();
  }
  private update() {
    this.openButton.innerHTML = `${this.state.started ? 'Fortsett etterforskningen' : 'Start etterforskningen'} <small>${this.state.found.length}/10 spor</small>`;
    this.openButton.setAttribute('aria-label', `Det manglende grunnlaget. ${this.state.found.length} av 10 spor samlet. Åpne etterforskningen.`);
    this.roomButton.hidden = !this.room;
    this.roomButton.textContent = this.room === 'leader' ? 'Se etterforskningens avslutning →' : `Undersøk sporene i dette rommet (${roomEvidence(this.state, this.room ?? '')}/2) · F`;
    this.scenery?.reflect(this.state);
    this.world?.invalidate();
  }
  show(route: Route, value = '') {
    if (route !== 'crisis') this.pauseClock();
    this.stopVoice();this.route = route;this.value = value;
    const content = route === 'brief' ? this.brief() : route === 'board' ? this.board() : route === 'room' ? this.roomView(value) :
      route === 'evidence' ? this.evidenceView(value) : route === 'triage' ? this.triageView() : route === 'access' ? this.accessView() :
      route === 'crisis' ? this.crisisView() : route === 'secret' ? this.secretView() : this.ending();
    this.hooks.dialog('Det manglende grunnlaget', `<section class="case17" aria-label="Den fiktive etterforskningen">
      <nav class="case17-nav" aria-label="Etterforskningen">${button('brief', 'Oppdraget')}${button('board', `Spor ${this.state.found.length}/10`)}${button('triage', 'Arbeidsbord')}${button('ending', 'Etterpå')}</nav>
      <p class="case17-fiction">${esc(data.fiction)}</p>
      ${!this.storageAvailable ? '<p class="case17-warning" role="status">Lagring er ikke tilgjengelig. Du kan spille, men fremdriften forsvinner når siden lukkes.</p>' : ''}
      <div id="case17-focus" tabindex="-1">${content}</div>
      <p id="case17-status" class="case17-status" role="status" aria-live="polite"></p>
      <footer class="case17-footer"><span>Ingen innlogging. Bare fiktivt materiale.</span><a href="${import.meta.env.BASE_URL}etterforskning.html">Les hele øvelsen som tekst ↗</a></footer></section>`);
    this.root.closest('dialog')!.scrollTop = 0;
    this.root.querySelector<HTMLElement>('#case17-focus')!.focus({preventScroll: true});
    this.clockDisplay();
  }
  private brief() {
    return `<div class="case17-cover"><span class="case17-folio">AURORA</span><p class="case17-overline">VALGFRI ETTERFORSKNING · FEM ROM</p><h3>${esc(data.title)}</h3><p class="case17-motif">«${esc(data.subtitle)}»</p><p class="case17-lead">${esc(data.brief)}</p>
      <div class="case17-path"><span>01 · Finn spor</span><span>02 · Prøv arbeidet</span><span>03 · Se følgene</span></div>
      ${button('start', this.state.started ? 'Fortsett undersøkelsen →' : 'Åpne saksmappen →', '', 'class="primary"')}
      <p>Denne sammenhengende fiksjonen er et eget fordypningsspor. De virkelige utstillingene, lederøvelsene og besøket ditt er uavhengige av etterforskningen. Ingen rom er låst. Tidsfristen er valgfri.</p></div>`;
  }
  private board() {
    const s = this.summary();
    return `<p class="case17-overline">BEVISMAPPEN · ${this.state.found.length} AV 10 SPOR</p><h3>Hva vet vi egentlig?</h3>
      <p>Samle to spor i hvert rom. Legg merke til forskjellen mellom et dokument, en antakelse og en bekreftet handling.</p>
      <div class="case17-rooms">${data.rooms.map((r, i) => `<article class="case17-roomcard ${roomEvidence(this.state, r.id) === 2 ? 'is-found' : ''}"><span class="case17-number">0${i + 1}</span><div><h4>${esc(r.title)}</h4><p>${roomEvidence(this.state, r.id)}/2 spor samlet</p>${button('room', 'Undersøk sporene →', r.id)} ${button('visit', 'Gå til rommet', r.id)}</div></article>`).join('')}</div>
      <details class="case17-detail"><summary>Tidslinjen · Bare spor du har samlet</summary><ol class="case17-timeline">${[...data.evidence].sort((a,b)=>a.chronologicalOrder-b.chronologicalOrder).map(e => `<li><time>${esc(e.time)}</time>${this.state.found.includes(e.id) ? button('evidence', esc(e.short), e.id) : '<span>Et spor gjenstår</span>'}</li>`).join('')}</ol></details>
      <div class="case17-workgrid">${button('triage', `<strong>Dokumentbordet</strong><span>${s.classified}/6 avklart</span>`)}${button('access', `<strong>Innsynsbordet</strong><span>${s.disclosed}/4 avklart</span>`)}${button('crisis', `<strong>Beslutningen</strong><span>${s.decisions}/6 valg undersøkt</span>`)}</div>
      <details class="case17-detail"><summary>Små spor utenfor hovedsaken</summary><p>En halvåpen skuff ved det siste undersøkelsesbordet har nummer 00.</p>${button('secret', 'Åpne skuff 00 →')}</details>`;
  }
  private roomView(id: string) {
    const r = data.rooms.find(r => r.id === id) ?? data.rooms[0];
    return `<p class="case17-overline">UNDERSØKELSESBORD · ${roomEvidence(this.state, r.id)}/2 SPOR</p><h3>${esc(r.title)}</h3><p class="case17-lead">${esc(r.question)}</p>
      <div class="case17-role"><span>EN TENKT ${esc(r.role.toUpperCase())}</span><blockquote>«${esc(r.voice)}»</blockquote>${button('voice', 'Les opp med lokal nettleserstemme', r.id)}<small>Fiktiv replikk. Ikke et vitneutsagn eller et originalopptak.</small></div>
      <div class="case17-evidence-list">${data.evidence.filter(e => e.room === r.id).map(e => button('evidence', `<span>${esc(e.kind)} · ${esc(e.time)}</span><strong>${esc(e.title)}</strong><small>${this.state.found.includes(e.id) ? '✓ I bevismappen · Les igjen' : 'Åpne og undersøk →'}</small>`, e.id)).join('')}</div>
      <aside class="case17-boundary"><strong>Ved siden av fiksjonen: den virkelige saken</strong><p>Rommet har også en kildebasert utstilling. Aurora-dokumentene ovenfor er oppdiktet og er ikke bevis i den virkelige saken.</p>${button('real', 'Les den virkelige saken og kildene ↗', r.id)}</aside>`;
  }
  private evidenceView(id: string) {
    const e = data.evidence.find(e => e.id === id) ?? data.evidence[0];
    return `${button('room', '← Til undersøkelsesbordet', e.room)}<article class="case17-document"><div class="case17-document-meta"><span>${esc(e.kind)}</span><span>AURORA / ${esc(e.id.toUpperCase())}</span></div><h3>${esc(e.title)}</h3><pre>${esc(e.body)}</pre><span class="case17-stamp">FIKTIVT MATERIALE</span></article>
      <div class="case17-interpretation"><strong>Hva kan sporet si oss?</strong><p>${esc(e.meaning)}</p></div>
      ${button('collect', this.state.found.includes(e.id) ? '✓ Samlet · Tilbake til bordet' : 'Legg sporet i bevismappen +', e.id, 'class="primary"')}`;
  }
  private triageView() {
    const t = data.triage[this.index % data.triage.length];const chosen = this.state.triage[t.id];
    return `<p class="case17-overline">DOKUMENTBORDET · ${this.index % 6 + 1}/6</p><h3>Hvor skal dette sporet?</h3><p>Sorter etter innhold og sammenheng, ikke filtype. Ingen av knappene gir generell tillatelse til sletting.</p>
      <article class="case17-document"><span>${esc(t.kind)}</span><h4>${esc(t.title)}</h4><p>${esc(t.body)}</p></article>
      <div class="case17-options">${triageOptions.map(([value, label]) => button('classify', esc(label), value, `aria-pressed="${chosen === value}"`)).join('')}</div>
      ${chosen ? `<div class="case17-feedback ${chosen === t.answer ? 'is-correct' : ''}" role="status"><strong>${chosen === t.answer ? 'Et begrunnet grep.' : 'Se på innholdet en gang til.'}</strong><p>${esc(t.explanation)}</p></div>` : ''}
      <div class="case17-actions">${button('triage-prev', '← Forrige')}${button('triage-next', this.index % 6 === 5 ? 'Til innsynsbordet →' : 'Neste dokument →', '', 'class="primary"')}</div>
      <p class="case17-small">Forenklet arbeidsøvelse, ikke en juridisk fasit. Bevaringsplikt, journalføring og kassasjon må vurderes etter gjeldende regelverk og den konkrete saken.</p>`;
  }
  private accessView() {
    const a = data.access[this.index % data.access.length];const chosen = this.state.access[a.id];
    const hidden = !!this.state.redactions[a.id];
    const body = a.body.split(/\[([^\]]+)\]/g).map((part, i) => i % 2 ? button('redaction', hidden ? '<span aria-hidden="true">████████████</span><span class="sr-only">Privat opplysning skjermet. Trykk for å vise i øvelsen.</span>' : esc(part), a.id, `class="case17-sensitive ${hidden ? 'is-redacted' : ''}" aria-pressed="${hidden}" aria-label="${hidden ? 'Vis opplysningen igjen i øvelsen' : 'Marker for sladding: '+esc(part)}"`) : esc(part)).join('');
    const correct = chosen === a.answer && (a.answer !== 'redact' || hidden);
    return `<p class="case17-overline">INNSYNSBORDET · ${this.index % 4 + 1}/4</p><h3>Gi innsyn. Skjerm presist.</h3><p>Innsynskravet gjelder dokumentasjonen av Aurora. Øvelsen oppgir hvilke private opplysninger som skal skjermes. Klikk på den markerte teksten for å prøve sladding.</p>
      <article class="case17-document"><span>${esc(a.meta)}</span><h4>${esc(a.title)}</h4><p class="case17-redaction-preview">${body}</p></article>
      <div class="case17-options">${accessOptions.map(([value, label]) => button('disclose', esc(label), value, `aria-pressed="${chosen === value}"`)).join('')}</div>
      ${chosen ? `<div class="case17-feedback ${correct ? 'is-correct' : ''}" role="status"><strong>${correct ? 'Dokumentet er vurdert på det oppgitte grunnlaget.' : chosen === 'redact' && a.answer === 'redact' && !hidden ? 'Marker opplysningen som skal skjermes.' : 'Denne avgjørelsen trenger en ny vurdering.'}</strong><p>${esc(a.explanation)}</p></div>` : ''}
      <div class="case17-actions">${button('access-prev', '← Forrige')}${button('access-next', this.index % 4 === 3 ? 'Til beslutningen →' : 'Neste dokument →', '', 'class="primary"')}</div>
      <p class="case17-small">Ingen virkelige personopplysninger. Dette er ikke et verktøy for sikker sladding av faktiske dokumenter. Lovhjemmel, begrunnelse og klageinformasjon må håndteres i en virkelig sak.</p>`;
  }
  private crisisView() {
    const i = this.index % 6;const c = data.crisis[i];const chosen = this.state.crisis[i];
    return `<p class="case17-overline">BESLUTNINGEN · ${i + 1}/6</p><h3>Det haster. Sporene skal vare.</h3>
      <div class="case17-clockbar"><span id="case17-clock" role="timer" aria-label="Valgfri tid igjen"></span>${button('clock', 'Start valgfri 30-sekundersrunde', '', 'id="case17-clock-toggle"')}${button('untimed', 'Uten tidspress')}</div>
      <p class="case17-small">Ingen klokke starter av seg selv. Klokken pauses når du lukker, bytter vindu eller skjuler siden. Ingen valg tas for deg.</p>
      <article class="case17-message"><span>${esc(c.time)} · NY HENVENDELSE</span><h4>${esc(c.title)}</h4><p>${esc(c.prompt)}</p></article>
      <div class="case17-options">${[i % 2, 1 - i % 2].map(option => button('decision', esc(c.options[option].title), String(option), `aria-pressed="${chosen === option}"`)).join('')}</div>
      ${chosen !== null ? `<div class="case17-feedback"><strong>Ved senere oppfølging · Tenkt følge</strong><p>${esc(c.options[chosen].outcome)}</p></div>` : ''}
      <div class="case17-actions">${button('crisis-prev', '← Forrige')}${button('crisis-next', i === 5 ? 'Se hva som står igjen →' : 'Neste henvendelse →', '', 'class="primary"')}</div>`;
  }
  private ending() {
    const s = this.summary();
    return `<p class="case17-overline">ETTER UNDERSØKELSEN</p><h3>${s.responsibleOutcome ? 'Du har lagt et etterprøvbart grunnlag.' : s.complete ? 'Undersøkelsen er ferdig. Ledergrep gjenstår.' : 'Hva står igjen å avklare?'}</h3>
      <p class="case17-lead">${s.decisions === 0 ? 'Du har ikke prøvd ledervalgene ennå. Undersøk dem for å se hvordan begrunnelser, ansvar og dokumentasjon påvirker den fiktive overleveringen.' : s.protectedDecisions === 6 ? 'Du har valgt å sikre grunnlaget, vise usikkerheten og plassere ansvaret. Følgene nedenfor viser hva valgene dine kan bety i denne øvelsen.' : `${s.protectedDecisions} av ${s.decisions} undersøkte ledervalg har den oppfølgingen øvelsen etterspør. ${s.unresolvedDecisions} valg trenger et bedre grep; ${s.unansweredDecisions} er ikke prøvd. Se begrunnelsene nedenfor og prøv igjen.`}</p>
      <div class="case17-metrics"><span><strong>${this.state.found.length}/10</strong>Spor samlet</span><span><strong>${s.classified}/6</strong>Dokumenter avklart</span><span><strong>${s.disclosed}/4</strong>Innsyn vurdert</span><span><strong>${s.decisions}/6</strong>Ledervalg prøvd</span><span><strong>${s.protectedDecisions}/6</strong>Valg med oppfølging</span></div>
      <div class="case17-outcomes">${data.crisis.map((c, i) => `<article class="${this.state.crisis[i] === 1 ? 'is-correct' : ''}"><h4>${esc(c.title)}</h4><p>${this.state.crisis[i] === null ? 'Ikke undersøkt. Ingen konsekvens er tillagt et valg du ikke har tatt.' : esc(c.options[this.state.crisis[i]!].outcome)}</p></article>`).join('')}</div>
      <div class="case17-conclusion"><h4>${esc(data.reconstruction.question)}</h4><p>Se særlig på utkastet og den siste overleveringen. Fravær av bevis er ikke automatisk bevis på fravær.</p><div class="case17-options">${data.reconstruction.options.map((o, i) => button('conclude', esc(o), String(i), `aria-pressed="${this.state.reconstruction === i}" ${this.state.found.length < 10 ? 'disabled' : ''}`)).join('')}</div>
      ${this.state.found.length < 10 ? '<p>Samle de ti sporene før du trekker konklusjonen. Museet og alle arbeidsbord er fortsatt åpne.</p>' : this.state.reconstruction !== null ? `<p class="case17-feedback" role="status">${this.state.reconstruction === 1 ? 'Du har skilt det dokumenterte fra det uavklarte. ' : 'Konklusjonen går lenger enn sporene gir grunnlag for. '}${esc(data.reconstruction.explanation)}</p>` : ''}</div>
      <blockquote class="case17-final-line">«Når noen spør hvorfor, skal svaret finnes uten oss.»</blockquote><p class="case17-small">Museets egen formulering.</p>
      ${s.complete ? '<p class="case17-complete" role="status">✓ Alle delene er gjennomgått. Dette betyr ikke at alle ledervalg er gode. Se oppfølgingen over og prøv gjerne igjen.</p>' : '<p>Fremdriften blir værende. Du kan gå tilbake, endre vurderinger og sammenligne følgene uten å starte på nytt.</p>'}
      <div class="case17-actions">${button('board', 'Til bevismappen')}${button('crisis', 'Forbedre ledervalgene ↺')}${button('report', 'Lagre min oppsummering ↓', '', 'class="primary"')}</div>
      <p class="case17-return">Samme spørsmål følger hele museet: Hva må en etterfølger kunne finne? ${button('leader', 'Ta med ett tiltak til Lederens rom →')}</p>
      <details class="case17-detail"><summary>Start etterforskningen på nytt</summary><p>Dette sletter bare etterforskningens fremdrift i denne nettleseren. Lederøvelser, lederbestilling og innstillinger beholdes.</p>${button('reset', 'Nullstill bare etterforskningen')}</details>`;
  }
  private secretView() {
    return `<p class="case17-overline">ET VALGFRITT FUNN · UTENFOR DE TI SPORENE</p><h3>${esc(data.secret.title)}</h3><article class="case17-document"><pre>${esc(data.secret.body)}</pre><span class="case17-stamp">FIKTIVT NOTAT</span></article><p class="case17-lead">${esc(data.secret.meaning)}</p>${button('keep-secret', this.state.secret ? '✓ Notatet er tatt vare på' : 'Ta vare på notatet +', '', 'class="primary"')}`;
  }
  private act(action: string, value: string) {
    if (['brief', 'board', 'room', 'evidence', 'triage', 'access', 'crisis', 'ending', 'secret'].includes(action)) {
      if (action === 'triage') this.index = Math.max(0, data.triage.findIndex(t => this.state.triage[t.id] !== t.answer));
      if (action === 'access') this.index = Math.max(0, data.access.findIndex(a => this.state.access[a.id] !== a.answer || a.answer === 'redact' && !this.state.redactions[a.id]));
      if (action === 'crisis') this.index = Math.max(0, this.state.crisis.findIndex(c => c === null));
      this.show(action as Route, value);return;
    }
    if (action === 'leader') {this.hooks.close();void this.hooks.visit('leader');}
    else if (action === 'start') {this.state.started = true;this.save();this.show('board');}
    else if (action === 'collect') {
      const e = data.evidence.find(e => e.id === value);if (!e) return;
      const added = collectEvidence(this.state, value);this.save();this.show('room', e.room);
      if (added) {this.status(`Spor samlet: ${e.title}. ${this.state.found.length} av 10.`);this.cue('paper');}
    } else if (action === 'classify' && triageOptions.some(([v]) => v === value)) {
      const t = data.triage[this.index % 6];this.state.triage[t.id] = value;this.save();this.show('triage');
    } else if (action === 'disclose' && accessOptions.some(([v]) => v === value)) {
      this.state.access[data.access[this.index % 4].id] = value;this.save();this.show('access');
    } else if (action === 'redaction' && ['a2', 'a4'].includes(value)) {
      this.state.redactions[value] = !this.state.redactions[value];this.save();this.show('access');
      this.root.querySelector<HTMLButtonElement>(`[data-c17="redaction"][data-value="${value}"]`)?.focus();
    } else if (action === 'decision' && ['0', '1'].includes(value)) {
      this.state.crisis[this.index % 6] = Number(value);this.save();this.show('crisis');this.cue('message');
    } else if (action === 'conclude' && this.state.found.length === 10 && ['0', '1', '2'].includes(value)) {
      this.state.reconstruction = Number(value);this.save();this.show('ending');
    } else if (/^(triage|access|crisis)-(next|prev)$/.test(action)) {
      const [task, direction] = action.split('-');const count = task === 'access' ? 4 : 6;
      if (direction === 'next' && this.index % count === count - 1) {
        this.index = 0;this.show(task === 'triage' ? 'access' : task === 'access' ? 'crisis' : 'ending');
      } else {this.index = (this.index + (direction === 'next' ? 1 : count - 1)) % count;this.show(task as Route);}
    } else if (action === 'visit') {this.hooks.close();void this.hooks.visit(value);}
    else if (action === 'real') {this.hooks.close();void this.hooks.read(value);}
    else if (action === 'voice') this.voice(value);
    else if (action === 'clock') {if (this.timer) this.pauseClock();else this.startClock();}
    else if (action === 'untimed') {this.pauseClock();this.remaining = 30000;this.clockDisplay();this.status('Du fortsetter uten tidspress. Ingen valg er endret.');}
    else if (action === 'keep-secret') {this.state.secret = true;this.save();this.show('secret');this.status('Et lite spor til etterfølgeren er tatt vare på.');this.cue('paper');}
    else if (action === 'report') {
      const blob = new Blob([caseReport(this.state, this.summary())], {type: 'text/plain;charset=utf-8'});
      const url = URL.createObjectURL(blob), link = document.createElement('a');link.href = url;link.download = 'arkivmuseet-etterforskning.txt';link.click();setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (action === 'reset') {this.pauseClock();this.state = freshCase();this.remaining = 30000;this.index = 0;this.save();this.show('brief');this.status('Etterforskningen er nullstilt. Resten av museet er uendret.');}
  }
  private status(text: string) {const el = this.root.querySelector('#case17-status');if (el) el.textContent = text;this.hooks.announce(text);}
  private startClock() {
    if (this.route !== 'crisis' || document.hidden) return;
    if (this.remaining <= 0) this.remaining = 30000;
    this.deadline = performance.now() + this.remaining;
    this.timer = setInterval(() => {
      if (!this.root.querySelector('#case17-clock') || document.hidden) {this.pauseClock();return;}
      this.remaining = Math.max(0, this.deadline - performance.now());this.clockDisplay();
      if (this.remaining === 0) {this.pauseClock();this.status('Tiden er ute. Ingen svar er valgt for deg. Fortsett uten tidspress, eller start klokken igjen.');}
    }, 200);this.clockDisplay();
  }
  private pauseClock() {
    if (this.timer) {this.remaining = Math.max(0, this.deadline - performance.now());clearInterval(this.timer);this.timer = null;}
    this.clockDisplay();
  }
  private clockDisplay() {
    const clock = this.root.querySelector('#case17-clock'), toggle = this.root.querySelector('#case17-clock-toggle');
    if (clock) clock.textContent = this.timer ? `${Math.ceil(this.remaining / 1000)} s igjen` : this.remaining < 30000 ? `${Math.ceil(this.remaining / 1000)} s · Pauset` : 'Uten tidspress';
    if (toggle) toggle.textContent = this.timer ? 'Pause klokken' : this.remaining < 30000 && this.remaining > 0 ? 'Fortsett klokken' : 'Start valgfri 30-sekundersrunde';
  }
  private stopVoice() {if ('speechSynthesis' in window) speechSynthesis.cancel();}
  private voice(id: string) {
    const r = data.rooms.find(r => r.id === id);if (!r) return;
    if (!('speechSynthesis' in window)) {this.status('Opplesning støttes ikke her. Hele replikken står i teksten.');return;}
    const voice = speechSynthesis.getVoices().find(v => v.localService && /^(nb|nn|no)(-|$)/i.test(v.lang));
    if (!voice) {this.status('Ingen lokal norsk stemme er tilgjengelig i denne nettleseren. Teksten er alltid lesbar. Ingen ekstern stemmetjeneste brukes.');return;}
    this.stopVoice();const utterance = new SpeechSynthesisUtterance(r.voice);utterance.voice = voice;utterance.lang = voice.lang;utterance.rate = .92;
    utterance.volume = Math.min(1, this.hooks.volume() * 2);utterance.onerror = () => this.status('Opplesningen kunne ikke fullføres. Replikken står i teksten.');speechSynthesis.speak(utterance);
    this.status(`Lokal, syntetisk opplesning av den tenkte ${r.role.toLowerCase()}ens replikk.`);
  }
  private cue(kind: 'paper' | 'message') {
    if (!this.hooks.sound()) return;
    try {
      this.audio ??= new AudioContext();const ctx = this.audio;void ctx.resume().catch(() => {});
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();const t = ctx.currentTime;
      oscillator.type = 'triangle';oscillator.frequency.setValueAtTime(kind === 'paper' ? 180 : 440, t);
      oscillator.frequency.exponentialRampToValueAtTime(kind === 'paper' ? 70 : 330, t + .09);
      gain.gain.setValueAtTime(.001, t);gain.gain.linearRampToValueAtTime(this.hooks.volume() * .13, t + .012);
      gain.gain.exponentialRampToValueAtTime(.001, t + .14);oscillator.connect(gain);gain.connect(ctx.destination);
      oscillator.start(t);oscillator.stop(t + .15);oscillator.onended = () => {oscillator.disconnect();gain.disconnect();};
    } catch { /* Sound is supplementary; casework remains usable without it. */ }
  }
}
