/** Real browser integration checks. All remote traffic is intercepted; no paid API is called.
 * npm run build && npm run test:browser
 * Optional: ARCHIVE_ASSIST_URL, ARCHIVE_ASSIST_CHROME, ARCHIVE_ASSIST_QA_DIR,
 * ARCHIVE_ASSIST_FIXTURES, ARCHIVE_ASSIST_HEADED=1, ARCHIVE_ASSIST_ROOT.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {access, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {resolve, relative, extname, basename, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inflateRawSync} from 'node:zlib';
import {chromium, expect} from '@playwright/test';

const appRoot=fileURLToPath(new URL('../../',import.meta.url));
const out=resolve(process.env.ARCHIVE_ASSIST_QA_DIR||resolve(appRoot,'qa-output'));
const fixtureRoot=resolve(process.env.ARCHIVE_ASSIST_FIXTURES||resolve(appRoot,'tests/fixtures'));
const results={checked:new Date().toISOString(),checks:[],errors:[],expectedErrors:[],missing:[],remote:[],screenshots:[]};
const pass=name=>{results.checks.push(name);console.log('PASS: '+name);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const exists=path=>access(path).then(()=>true,()=>false);
let server,browser;
const mocks=[];

async function fixtureFiles(dir) {
 const all=[];
 for(const entry of await readdir(dir,{withFileTypes:true})) {
  const path=resolve(dir,entry.name);
  if(entry.isDirectory())all.push(...await fixtureFiles(path));
  else if(/\.(txt|md)$/i.test(entry.name)&&! /^(readme|fasit|expected|manifest|license|credits)/i.test(entry.name))all.push(path);
 }
 return all.sort();
}

async function serve() {
 if(process.env.ARCHIVE_ASSIST_URL)return process.env.ARCHIVE_ASSIST_URL.replace(/\/?$/,'/');
 const root=process.env.ARCHIVE_ASSIST_ROOT?resolve(process.env.ARCHIVE_ASSIST_ROOT):
  await exists(resolve(appRoot,'dist/index.html'))?resolve(appRoot,'dist'):appRoot;
 results.servedRoot=root;
 const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
 server=createServer(async(req,res)=>{
  try {
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   const target=resolve(root,`.${pathname.endsWith('/')?pathname+'index.html':pathname}`);
   const inside=relative(root,target);
   if(inside==='..'||inside.startsWith(`..${sep}`)||req.method!=='GET'){res.writeHead(403);res.end();return;}
   const bytes=await readFile(target);res.writeHead(200,{'Content-Type':types[extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
  } catch {res.writeHead(404);res.end('Not found');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return `http://127.0.0.1:${server.address().port}/`;
}

// Independent readers verify downloaded formats, rather than reusing their writers.
function parseCsv(input) {
 const rows=[];let row=[],cell='',quoted=false;
 const text=input.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(cell);cell='';}
  else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(cell||row.length){row.push(cell);rows.push(row);}
 assert.equal(quoted,false,'CSV quotation closes');
 return rows;
}

function unzip(bytes) {
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 assert.ok(end>=0,'ZIP has a central directory');
 const count=bytes.readUInt16LE(end+10),entries=new Map();let offset=bytes.readUInt32LE(end+16);
 for(let i=0;i<count;i++){
  assert.equal(bytes.readUInt32LE(offset),0x02014b50,'Valid ZIP central record');
  const method=bytes.readUInt16LE(offset+10),length=bytes.readUInt32LE(offset+20),nameLength=bytes.readUInt16LE(offset+28);
  const name=bytes.subarray(offset+46,offset+46+nameLength).toString('utf8');
  assert.ok(!name.startsWith('/')&&!name.split('/').includes('..'),'Safe ZIP path');
  assert.ok(!entries.has(name),'Unique ZIP entry');
  const local=bytes.readUInt32LE(offset+42);
  assert.equal(bytes.readUInt32LE(local),0x04034b50,'Valid ZIP local header');
  const dataStart=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
  const compressed=bytes.subarray(dataStart,dataStart+length);
  assert.ok(method===0||method===8,'Supported ZIP compression');
  entries.set(name,method===8?inflateRawSync(compressed):compressed);
  offset+=46+nameLength+bytes.readUInt16LE(offset+30)+bytes.readUInt16LE(offset+32);
 }
 return entries;
}

async function createPage(url,viewport,label,{healthAvailable=true,publicHost=false}={}){
 const context=await browser.newContext({viewport,reducedMotion:'reduce',acceptDownloads:true,serviceWorkers:'block'});
 const mock={label,health:0,healthAvailable,sessionToken:'test-session',turnstile:0,posts:[],requestTokens:[],unexpected:[],allowed:0,releases:[],hold:false,expectedConsole:[]};mocks.push(mock);
 const pageUrl=publicHost?'https://archive-assist.invalid/':url;
 const localOrigin=new URL(pageUrl).origin;
 await context.route('**/*',async route=>{
  const request=route.request(),target=new URL(request.url());
  if(!['http:','https:'].includes(target.protocol))return route.continue();
  const event={label,method:request.method(),url:target.href};
  const headers={'content-type':'application/json'};
  if(!publicHost&&target.origin===localOrigin&&target.pathname==='/api/health'&&request.method()==='GET'){
   mock.health++;return route.fulfill({status:200,headers,body:JSON.stringify({configured:mock.healthAvailable,model:'gpt-6-luna',reasoning:'medium',authMode:'chatgpt',localRuntime:true,sessionToken:mock.sessionToken,message:mock.healthAvailable?'Syntetisk ChatGPT-tilkobling er klar.':'ChatGPT er ikke innlogget. Start npm run local.',...mock.healthOverrides})});
  }
  if(!publicHost&&target.origin===localOrigin&&target.pathname==='/api/archive-assist'&&request.method()==='POST'){
   const payload=request.postDataJSON();mock.posts.push(payload);mock.requestTokens.push(request.headers()['x-archive-session']);
   if(mock.allowed<=0){mock.unexpected.push(event);return route.fulfill({status:403,headers,body:JSON.stringify({message:'Unexpected AI call blocked by browser QA'})});}
   mock.allowed--;
   if(request.headers()['x-archive-session']!==mock.sessionToken)return route.fulfill({status:403,headers,body:JSON.stringify({message:'Syntetisk lokal økt er utløpt. Åpne AI-valget på nytt.'})});
   if(mock.hold)await new Promise(resolve=>mock.releases.push(resolve));
   if(mock.postError)return route.fulfill({status:mock.postError.status,headers,body:JSON.stringify({message:mock.postError.message})});
   return route.fulfill({status:200,headers,body:JSON.stringify({mode:'luna',model:'gpt-6-luna',reasoning:'medium',authMode:'chatgpt',analysis:{title:mock.titles?.[payload.fileName]||'AI-forslag om syntetisk dokumentkontroll',documentType:'Rapport',subject:'Syntetisk QA',creator:'Fiktiv QA-avsender',organizationalUnit:'Testenhet',documentDate:'2040-01-01',relation:'Sak QA/2026-01',description:'AI foreslår en annen beskrivelse.',keywords:['kvalitetstest'],rationale:'Syntetisk svar kontrollert av nettlesertesten.',confidence:.87},...mock.answerOverrides})});
  }
  if(target.origin===localOrigin&&request.method()==='GET'&&!target.pathname.startsWith('/api/')){
   if(publicHost)return route.fulfill({response:await route.fetch({url:new URL(target.pathname+target.search,url).href})});
   return route.continue();
  }
  results.remote.push(event);
  if(target.hostname==='challenges.cloudflare.com')mock.turnstile++;
  mock.unexpected.push(event);
  return route.fulfill({status:403,headers,body:JSON.stringify({message:'Outbound request blocked by browser QA'})});
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',error=>results.errors.push({label,message:error.message}));
 page.on('console',message=>{if(message.type()==='error')(mock.expectedConsole.some(pattern=>pattern.test(message.text()))?results.expectedErrors:results.errors).push({label,message:message.text()});});
 page.on('response',response=>{if(response.url().startsWith(pageUrl)&&response.status()>=400&&!response.url().endsWith('/favicon.ico')&&!new URL(response.url()).pathname.startsWith('/api/'))results.missing.push({label,status:response.status(),url:response.url()});});
 await page.goto(pageUrl);await expect(page.locator('#sample-button')).toBeEnabled();
 return {page,context,mock};
}

async function idle(page,count){
 await expect(page.locator('#file-count')).toHaveText(String(count));
 await expect(page.locator('body')).not.toHaveClass(/is-busy/);
 await expect(page.locator('#file-input')).toBeEnabled();
}
async function selectFile(page,name){
 const card=page.locator('#file-list .file-card').filter({has:page.locator('small[title]').filter({hasText:name})});
 await expect(card).toHaveCount(1);await card.click();await expect(card).toHaveClass(/is-selected/);
}
const field=(page,name)=>page.locator(`#editor-form [name="${name}"]`);
async function details(page,selector){if(await page.locator(selector).getAttribute('open')===null)await page.locator(`${selector}>summary`).click();}
async function download(page,selector){
 const pending=page.waitForEvent('download');await page.locator(selector).click();const file=await pending;
 const path=await file.path();assert.ok(path,`Download completed: ${selector}`);return {bytes:await readFile(path),name:file.suggestedFilename()};
}
async function screenshot(page,name){const path=resolve(out,`${name}.png`);await page.screenshot({path,fullPage:true});results.screenshots.push(path);}
async function noOverflow(page,label){
 const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
 assert.ok(dimensions.scroll<=dimensions.width+1,`${label}: no page-level horizontal overflow (${dimensions.scroll}/${dimensions.width})`);
 const source=page.locator('#source-text');
 if(await source.isVisible()){const rect=await source.boundingBox();assert.ok(rect.x>=-1&&rect.x+rect.width<=dimensions.width+1,`${label}: source is inside viewport`);}
 pass(`${label}: content and source fit viewport`);
}

try {
 await mkdir(out,{recursive:true});
 const candidates=await fixtureFiles(fixtureRoot);
 assert.ok(candidates.length>=2,`At least two synthetic TXT/Markdown fixtures required in ${fixtureRoot}`);
 const sourceFiles=[];
 for(const path of candidates){
  const bytes=await readFile(path);let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('windows-1252').decode(bytes);}
  if(bytes.length>30)sourceFiles.push({path,name:basename(path),bytes,text:text.replace(/\r\n?/g,'\n').trim()});
  if(sourceFiles.length===2)break;
 }
 assert.equal(sourceFiles.length,2,'Two usable source fixtures');
 results.fixtures=sourceFiles.map(({name,bytes})=>({name,sha256:hash(bytes)}));
 const url=await serve();results.url=url;
 browser=await chromium.launch({executablePath:process.env.ARCHIVE_ASSIST_CHROME||undefined,headless:process.env.ARCHIVE_ASSIST_HEADED!=='1'});
 const {page,context,mock}=await createPage(url,{width:1440,height:960},'desktop');
 await expect(page.locator('#empty-state')).toBeVisible();
 await noOverflow(page,'1440 px empty state');
 // Keyboard entry uses the actual file chooser; no programmatic addFiles shortcut.
 await page.locator('#dropzone').focus();const chooser=page.waitForEvent('filechooser');await page.keyboard.press('Enter');
 await (await chooser).setFiles(sourceFiles.map(file=>file.path));await idle(page,2);
 pass('Keyboard-operable upload imports two synthetic source files');
 const first=sourceFiles[0],second=sourceFiles[1];
 await selectFile(page,first.name);
 await expect(page.locator('#source-text')).toContainText(first.text.trim().slice(0,50));
 await details(page,'.metadata-details');
 await expect(field(page,'sha256')).toHaveValue(hash(first.bytes));
 await expect(field(page,'sha256')).toHaveAttribute('readonly','');
 const edited={title:'Kontrollert tittel – syntetisk dokument',description:'Manuell beskrivelse med komma, "sitat" og\nny linje.',documentDate:'2020-04-12',creator:'Fiktiv kontrollør',caseReference:'QA/2026-01',notes:'Kontrollert i nettlesertest',source:'Syntetisk testgrunnlag'};
 for(const [name,value] of Object.entries(edited))await field(page,name).fill(value);
 await expect(page.locator('#title-review')).toHaveText('Redigert av bruker');
 await field(page,'retentionDecision').selectOption('Kasseres etter angitt tid');await field(page,'retentionYears').fill('7');await field(page,'retentionYears').press('Tab');
 await expect(field(page,'disposalYear')).toHaveValue('2027');
 await field(page,'accessLevel').selectOption('Intern');
 await selectFile(page,second.name);
 await expect(page.locator('#source-text')).toContainText(second.text.trim().slice(0,50));
 await expect(page.locator('#source-text')).not.toHaveText(first.text.trim());
 const suggestion=await page.locator('#title-suggestion').innerText();
 await page.locator('#use-title-suggestion').click();await expect(field(page,'title')).toHaveValue(suggestion);await expect(page.locator('#title-review')).toHaveText('Godkjent');
 await selectFile(page,first.name);
 for(const [name,value] of Object.entries(edited))await expect(field(page,name)).toHaveValue(value);
 await page.locator('#approve-title').focus();await page.keyboard.press('Space');await expect(page.locator('#title-review')).toHaveText('Godkjent');
 pass('Source switching preserves manual fields, source SHA-256, approval and calculated retention year');
 await noOverflow(page,'1440 px loaded workspace');await screenshot(page,'desktop-reviewed');

 // Download semantics: edited metadata changes, but originals remain byte-for-byte intact.
 const manifest=JSON.parse((await download(page,'#download-json')).bytes.toString('utf8'));
 assert.equal(manifest.fileCount,2);assert.equal(manifest.files.length,2);
 const exported=manifest.files.find(file=>file.originalFileName===first.name);assert.ok(exported);
 for(const [name,value] of Object.entries(edited))assert.equal(exported[name],value,`JSON preserves ${name}`);
 assert.equal(exported.sha256,hash(first.bytes));assert.equal(exported.titleReviewStatus,'Godkjent');assert.equal(exported.disposalYear,'2027');
 pass('JSON download contains reviewed fields, approval and original checksum');
 const csvDownload=await download(page,'#download-csv'),csv=parseCsv(csvDownload.bytes.toString('utf8'));
 assert.equal(csv.length,3);assert.ok(csv.every(row=>row.length===csv[0].length));
 const csvRow=csv.find(row=>row[csv[0].indexOf('Opprinnelig filnavn')]===first.name);
 assert.equal(csvRow[csv[0].indexOf('Saksdokumenttittel')],edited.title);assert.equal(csvRow[csv[0].indexOf('Beskrivelse')],edited.description);
 assert.equal(csvRow[csv[0].indexOf('SHA-256')],hash(first.bytes));pass('CSV download round-trips quoted multiline fields and matches JSON');
 const report=(await download(page,'#download-report')).bytes.toString('utf8');
 assert.match(report,/kontrollrapport/i);assert.ok(report.includes(edited.title));assert.ok(report.includes(hash(first.bytes)));assert.match(report,/Godkjent/);assert.match(report,/Kontrollpunkter/);pass('Control report retains provenance, human review and unresolved checks');
 const zip=unzip((await download(page,'#download-zip')).bytes);
 assert.ok(zip.has('manifest.json')&&zip.has('manifest.csv')&&zip.has('README.txt'));
 const zipManifest=JSON.parse(zip.get('manifest.json').toString('utf8'));
 assert.deepEqual(zipManifest.files,manifest.files);
 assert.equal([...zip.keys()].filter(name=>name.startsWith('dokumenter/')).length,2);
 for(const original of sourceFiles){
  const metadata=zipManifest.files.find(file=>file.originalFileName===original.name);
  const bytes=zip.get(`dokumenter/${metadata.proposedFileName}`);assert.ok(bytes);assert.deepEqual(bytes,original.bytes,'Original source bytes survive ZIP export');
  const sidecar=[...zip.entries()].filter(([name])=>name.startsWith('metadata/')).map(([,data])=>JSON.parse(data.toString('utf8'))).find(file=>file.originalFileName===original.name);
  assert.deepEqual(sidecar,metadata);assert.equal(hash(bytes),metadata.sha256);
 }
 pass('ZIP contains original bytes, matching JSON/CSV manifest and sidecars');

 // Availability alone must never be treated as permission to submit document content.
 assert.equal(mock.health,0);assert.equal(mock.turnstile,0);assert.equal(mock.posts.length,0);assert.deepEqual(mock.unexpected,[]);
 pass('Upload, editing, approval and export make no external requests');
 const aiOptions=page.locator('#ai-options');await expect(aiOptions).not.toHaveAttribute('open','');
 await page.locator('#ai-options>summary').focus();await page.keyboard.press('Space');
 await expect.poll(()=>mock.health).toBeGreaterThan(0);await expect(page.locator('#run-file-ai')).toBeEnabled();
 assert.equal(mock.posts.length,0);assert.equal(mock.turnstile,0);pass('Opening optional AI checks only the local ChatGPT connection');
 await details(page,'.ai-context');
 const userContext={operatorName:'Syntetisk dokumentbehandler',department:'QA-arkiv',parentContext:'Sak QA/2026-01 – kontroll av syntetisk materiale'};
 for(const [name,value] of Object.entries(userContext))await page.locator(`#ai-context-form [name="${name}"]`).fill(value);
 assert.equal(mock.posts.length,0,'Entering optional work context does not send documents');
 mock.allowed=1;mock.hold=true;
 await page.locator('#run-file-ai').click();await expect.poll(()=>mock.posts.length).toBe(1);
 await expect.poll(()=>mock.releases.length).toBe(1);
 const concurrent={title:'Menneskeredigert mens AI svarer',description:'Ny beskrivelse mens den syntetiske forespørselen pågår.',documentDate:'2021-06-17'};
 for(const [name,value] of Object.entries(concurrent))await field(page,name).fill(value);
 mock.releases.shift()();
 await expect(page.locator('#title-suggestion')).toHaveText('AI-forslag om syntetisk dokumentkontroll');
 for(const [name,value] of Object.entries(concurrent))await expect(field(page,name)).toHaveValue(value);
 await expect(page.locator('#title-review')).toHaveText('Redigert av bruker');
 assert.equal(mock.posts[0].fileName,first.name);assert.ok(mock.posts[0].text.includes(first.text.trim().slice(0,50)));assert.ok(mock.posts[0].text.length<=12000);
 assert.deepEqual(Object.keys(mock.posts[0]).sort(),['fileName','metadata','text','userContext']);
 assert.deepEqual(Object.keys(mock.posts[0].metadata).sort(),['titleSuggestion','title','documentType','subject','documentDate','creator','organizationalUnit','language','contentExtractionMethod','caseReference','relation','source'].sort());
 assert.deepEqual(mock.posts[0].userContext,userContext);
 await expect(field(page,'creator')).toHaveValue(edited.creator);
 await expect(field(page,'organizationalUnit')).not.toHaveValue(userContext.department);
 await expect(field(page,'relation')).toHaveValue('Sak QA/2026-01');
 await expect(page.locator('#title-method')).toContainText('GPT-6 Luna');
 const analyzed=JSON.parse((await download(page,'#download-json')).bytes.toString('utf8')).files.find(file=>file.originalFileName===first.name);
 assert.match(analyzed.titleSuggestionMethod,/GPT-6 Luna/);assert.match(analyzed.aiAnalysisStatus,/GPT-6 Luna/);
 assert.equal(analyzed.creator,edited.creator);assert.equal(analyzed.relation,'Sak QA/2026-01');
 pass('Optional work context is sent only on explicit analysis; operator identity never replaces document authorship');
 assert.equal(mock.posts.length,1);pass('One explicit mocked AI request preserves edits made while its response is pending');

 await page.locator('#remove-file').click();await idle(page,1);await expect(page.locator('#source-text')).toContainText(second.text.trim().slice(0,50));
 await page.locator('#clear-button').click();await idle(page,0);await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#empty-state')).toBeVisible();
 await page.locator('#file-input').setInputFiles(first.path);await idle(page,1);await expect(page.locator('#source-text')).toContainText(first.text.trim().slice(0,50));
 await expect(field(page,'sha256')).toHaveValue(hash(first.bytes));assert.equal(mock.posts.length,1);
 pass('Remove, clear and same-file reimport update sources without implicit AI');
 await page.locator('#clear-button').click();await idle(page,0);
 await page.locator('#paste-text').fill('   ');await page.locator('#analyze-text').click();await expect(page.locator('#status')).toHaveAttribute('data-kind','error');await idle(page,0);
 await expect(page.locator('#paste-text')).toBeFocused();pass('Whitespace-only paste gives an actionable error without a record');
 await page.locator('#file-input').setInputFiles(Array.from({length:51},(_,i)=>({name:`limit-${i}.txt`,mimeType:'text/plain',buffer:Buffer.from('Syntetisk test')})));
 await expect(page.locator('#status')).toHaveAttribute('data-kind','error');await expect(page.locator('#status')).toContainText('50');await idle(page,0);pass('File-count limit rejects the whole oversized batch');
 await context.close();

 // Missing extraction must remain a usable manual workflow, with no invented document date.
 {
  const {page,context,mock}=await createPage(url,{width:1440,height:960},'empty-unreadable');
  const files=[{name:'qa-empty.txt',mimeType:'text/plain',buffer:Buffer.alloc(0)},{name:'qa-unreadable.bin',mimeType:'application/octet-stream',buffer:Buffer.from([0,255,128,0,17,33])}];
  await page.locator('#file-input').setInputFiles(files);await idle(page,2);
  for(const file of files){
   await selectFile(page,file.name);await expect(page.locator('#source-text')).toContainText('Ingen lesbar tekst');
   await expect(page.locator('#source-count')).toHaveText('0 tegn');await expect(field(page,'documentDate')).toHaveValue('');
   await field(page,'title').fill(`Manuelt kontrollert ${file.name}`);await field(page,'description').fill('Manuell beskrivelse etter kontroll av originalfilen.');
   await page.locator('#approve-title').click();await expect(page.locator('#title-review')).toHaveText('Godkjent');
  }
  const manifest=JSON.parse((await download(page,'#download-json')).bytes.toString('utf8'));
  assert.equal(manifest.fileCount,2);
  for(const file of files){const metadata=manifest.files.find(record=>record.originalFileName===file.name);assert.ok(metadata);assert.equal(metadata.contentCharacters,0);assert.equal(metadata.title,`Manuelt kontrollert ${file.name}`);assert.equal(metadata.documentDate,'');assert.equal(metadata.sha256,hash(file.buffer));}
  assert.equal(mock.health,0);assert.equal(mock.posts.length,0);
  pass('Empty and unreadable files explain missing source text and still support manual fields and verified export');
  await context.close();
 }

 // Restarting the local server rotates its token; reconnect without reloading this in-memory workspace.
 {
  const {page,context,mock}=await createPage(url,{width:768,height:900},'rotated-session');
  mock.expectedConsole=[/Syntetisk lokal økt er utløpt/,/Failed to load resource: the server responded with a status of 403/];
  await page.locator('#file-input').setInputFiles(first.path);await idle(page,1);
  await field(page,'title').fill('Menneskekontrollert før serveren startet på nytt');
  await field(page,'description').fill('Skal beholdes gjennom ny lokal tilkobling.');
  const localSuggestion=await page.locator('#title-suggestion').innerText();
  await details(page,'#ai-options');await expect(page.locator('#run-file-ai')).toBeEnabled();
  mock.sessionToken='rotated-session';mock.allowed=1;await page.locator('#run-file-ai').click();
  await expect(page.locator('#status')).toHaveAttribute('data-kind','error');await expect(page.locator('#ai-heading')).toContainText('ikke koblet til');
  await expect(page.locator('#run-file-ai')).toBeDisabled();await expect(page.locator('#run-all-ai')).toBeDisabled();
  await expect(page.locator('#title-suggestion')).toHaveText(localSuggestion);
  assert.equal(mock.posts.length,1);assert.equal(mock.health,1,'Session failure does not automatically reconnect or resend content');
  await page.locator('#ai-options>summary').click();await details(page,'#ai-options');
  await expect(page.locator('#run-file-ai')).toBeEnabled();assert.equal(mock.health,2);assert.equal(mock.posts.length,1,'Reconnecting checks only account availability');
  mock.allowed=1;await page.locator('#run-file-ai').click();await expect(page.locator('#title-suggestion')).toHaveText('AI-forslag om syntetisk dokumentkontroll');
  await expect(field(page,'title')).toHaveValue('Menneskekontrollert før serveren startet på nytt');await expect(field(page,'description')).toHaveValue('Skal beholdes gjennom ny lokal tilkobling.');
  await expect(page.locator('#source-text')).toContainText(first.text.trim().slice(0,50));
  const restored=JSON.parse((await download(page,'#download-json')).bytes.toString('utf8')).files[0];
  assert.equal(restored.sha256,hash(first.bytes));assert.equal(restored.title,'Menneskekontrollert før serveren startet på nytt');
  assert.deepEqual(mock.requestTokens,['test-session','rotated-session']);assert.equal(mock.posts.length,2);assert.deepEqual(mock.unexpected,[]);
  pass('Expired local session reconnects and retries only on explicit actions while preserving documents and manual edits');
  await context.close();
 }

 // A public static page must not reach any account bridge or the old paid Worker.
 {
  const {page,context,mock}=await createPage(url,{width:768,height:900},'public-static',{publicHost:true});
  await page.locator('#file-input').setInputFiles(first.path);await idle(page,1);await details(page,'#ai-options');
  await expect(page.locator('#ai-copy')).toContainText('npm run local');
  await expect(page.locator('#run-file-ai')).toBeDisabled();await expect(page.locator('#run-all-ai')).toBeDisabled();
  const local=JSON.parse((await download(page,'#download-json')).bytes.toString('utf8'));
  assert.equal(local.files[0].sha256,hash(first.bytes));assert.equal(mock.health,0);assert.equal(mock.posts.length,0);assert.deepEqual(mock.unexpected,[]);
  pass('Public static hosting explains local startup and keeps local exports working without account or paid API traffic');
  await context.close();
 }

 // Wrong provider/model/reasoning capabilities cannot silently enable another backend.
 for(const healthOverrides of [{model:'gpt-5.6-luna'},{reasoning:'high'},{authMode:'apikey'}]){
  const {page,context,mock}=await createPage(url,{width:768,height:900},`unsupported-${Object.keys(healthOverrides)[0]}`);
  mock.healthOverrides=healthOverrides;
  await page.locator('#file-input').setInputFiles(first.path);await idle(page,1);await details(page,'#ai-options');
  await expect(page.locator('#ai-heading')).toContainText('ikke koblet til');
  await expect(page.locator('#run-file-ai')).toBeDisabled();await expect(page.locator('#run-all-ai')).toBeDisabled();
  assert.equal(mock.health,1);assert.equal(mock.posts.length,0);assert.deepEqual(mock.unexpected,[]);
  pass(`Incompatible ${Object.keys(healthOverrides)[0]} capability remains unavailable without a fallback request`);
  await context.close();
 }

 // Expected failures must retain reviewed values and source bytes, with no hidden retries.
 for(const failure of [
  {label:'bridge-failure',postError:{status:502,message:'Syntetisk lokal tilkoblingsfeil'},expected:/Syntetisk lokal tilkoblingsfeil/},
  {label:'wrong-response-model',answerOverrides:{model:'gpt-5.6-luna'},expected:/Ugyldig svar fra den lokale Luna/},
  {label:'invalid-analysis',answerOverrides:{analysis:{title:'',confidence:.8}},expected:/manglet en brukbar saksdokumenttittel/}
 ]){
  const {page,context,mock}=await createPage(url,{width:768,height:900},failure.label);
  Object.assign(mock,failure);mock.expectedConsole=[failure.expected,/Failed to load resource: the server responded with a status of 502/];
  await page.locator('#file-input').setInputFiles(first.path);await idle(page,1);
  const localSuggestion=await page.locator('#title-suggestion').innerText();
  await field(page,'title').fill('Kontrollert før lokal AI-feil');await page.locator('#approve-title').click();
  await details(page,'#ai-options');await expect(page.locator('#run-file-ai')).toBeEnabled();
  mock.allowed=1;await page.locator('#run-file-ai').click();
  await expect(page.locator('#status')).toHaveAttribute('data-kind','error');await expect(page.locator('#status')).toContainText(failure.expected);
  await expect(page.locator('#run-file-ai')).toBeEnabled();
  await expect(page.locator('#title-suggestion')).toHaveText(localSuggestion);await expect(field(page,'title')).toHaveValue('Kontrollert før lokal AI-feil');
  const after=JSON.parse((await download(page,'#download-json')).bytes.toString('utf8'));
  assert.equal(after.files[0].title,'Kontrollert før lokal AI-feil');assert.equal(after.files[0].sha256,hash(first.bytes));
  assert.match(after.files[0].aiAnalysisStatus,/Ikke fullført/);assert.equal(mock.posts.length,1);assert.equal(mock.turnstile,0);assert.deepEqual(mock.unexpected,[]);
  pass(`${failure.label}: explicit local error preserves reviewed metadata and export without retry or paid fallback`);
  await context.close();
 }

 // Pasted markup is source evidence, never executable page content.
 {
  const {page,context,mock}=await createPage(url,{width:390,height:900},'literal-markup');
  const literal='Emne: Syntetisk test av bokstavelig tekst\n\n<script data-qa-injected="script">window.__qaExecuted=true;</script>\n<img data-qa-injected="image" src="qa-never-fetch.png" onerror="window.__qaExecuted=true">\nTeksten skal vises bokstavelig: <strong>æ, ø og å</strong>.';
  await page.locator('#paste-text').fill(literal);await page.locator('#analyze-text').click();await idle(page,1);
  await expect(page.locator('#source-text')).toHaveText(literal);
  await expect(page.locator('[data-qa-injected]')).toHaveCount(0);await expect(page.locator('#source-text script,#source-text img,#source-text strong')).toHaveCount(0);
  assert.equal(await page.evaluate(()=>window.__qaExecuted),undefined);assert.equal(mock.posts.length,0);assert.deepEqual(mock.unexpected,[]);
  await noOverflow(page,'390 px literal markup source');
  pass('HTML and script-like pasted content remains literal source text without execution or injected elements');
  await context.close();
 }

 // An unavailable optional service must not block local review/export, and its retry must work.
 {
  const {page,context,mock}=await createPage(url,{width:768,height:900},'unavailable-ai',{healthAvailable:false});
  await page.locator('#file-input').setInputFiles(first.path);await idle(page,1);await details(page,'#ai-options');
  await expect(page.locator('#ai-heading')).toContainText('ikke koblet til');await expect(page.locator('#ai-copy')).toContainText('Lukk og åpne');
  await expect(page.locator('#run-file-ai')).toBeDisabled();await expect(page.locator('#run-all-ai')).toBeDisabled();
  await field(page,'title').fill('Lokalt kontrollert uten tilgjengelig AI');await page.locator('#approve-title').click();
  const offline=JSON.parse((await download(page,'#download-json')).bytes.toString('utf8'));
  assert.equal(offline.files[0].title,'Lokalt kontrollert uten tilgjengelig AI');assert.equal(offline.files[0].sha256,hash(first.bytes));
  assert.equal(mock.posts.length,0);assert.equal(mock.turnstile,0);
  mock.healthAvailable=true;
  await page.locator('#ai-options>summary').click();await expect(page.locator('#ai-options')).not.toHaveAttribute('open','');
  await details(page,'#ai-options');await expect.poll(()=>mock.health).toBe(2);await expect(page.locator('#run-file-ai')).toBeEnabled();
  assert.equal(mock.posts.length,0);assert.equal(mock.turnstile,0);
  pass('Unavailable AI exposes retry guidance while local export works; retry restores availability without analysis');
  await context.close();
 }

 // Deterministic delay reproduces typing a second document while the first is hashing.
 {
  const {page,context,mock}=await createPage(url,{width:1440,height:960},'paste-race');
  const initial='Emne: Første syntetiske dokument\n\nDette dokumentet skal importeres.';
  const next='Emne: Neste syntetiske dokument\n\nDette skrives mens første dokument importeres.';
  await page.evaluate(()=>{
   const digest=crypto.subtle.digest.bind(crypto.subtle);
   crypto.subtle.digest=async(...args)=>{
    crypto.subtle.digest=digest;
    await new Promise(resolve=>{window.__qaReleaseDigest=resolve;});
    return digest(...args);
   };
  });
  await page.locator('#paste-text').fill(initial);await page.locator('#analyze-text').click();
  await expect(page.locator('body')).toHaveClass(/is-busy/);
  await page.waitForFunction(()=>typeof window.__qaReleaseDigest==='function');
  await page.locator('#paste-text').fill(next);
  await page.evaluate(()=>{window.__qaReleaseDigest();delete window.__qaReleaseDigest;});
  await idle(page,1);await expect(page.locator('#source-text')).toHaveText(initial);
  await expect(page.locator('#paste-text')).toHaveValue(next);
  await page.locator('#analyze-text').click();await idle(page,2);
  await expect(page.locator('#source-text')).toHaveText(next);await expect(page.locator('#paste-text')).toHaveValue('');
  assert.equal(mock.posts.length,0);assert.equal(mock.health,0);
  pass('Delayed paste import preserves subsequently typed text and clears only an unchanged submitted value');
  await context.close();
 }

 // Batch responses must never display the background record beside another selected source.
 {
  const {page,context,mock}=await createPage(url,{width:1440,height:960},'batch-ai');
  await page.locator('#file-input').setInputFiles(sourceFiles.map(file=>file.path));await idle(page,2);
  await selectFile(page,second.name);const secondLocal=await page.locator('#title-suggestion').innerText();
  await details(page,'#ai-options');await expect(page.locator('#run-all-ai')).toBeEnabled();
  mock.allowed=2;mock.hold=true;mock.titles={[first.name]:'AI-kontroll av første syntetiske dokument',[second.name]:'AI-kontroll av andre syntetiske dokument'};
  await page.locator('#run-all-ai').click();await expect.poll(()=>mock.posts.length).toBe(1);await expect.poll(()=>mock.releases.length).toBe(1);
  await expect(page.locator('#source-text')).toContainText(second.text.slice(0,50));
  await expect(page.locator('#title-suggestion')).toHaveText(secondLocal);
  await expect(page.locator('#run-file-ai')).toBeDisabled();await expect(page.locator('#run-all-ai')).toBeDisabled();
  // A synthetic event also exercises the handler guard, beyond the disabled native control.
  await page.locator('#run-file-ai').evaluate(button=>button.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.locator('#run-all-ai').evaluate(button=>button.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await selectFile(page,first.name);
  await expect(page.locator('#source-text')).toContainText(first.text.slice(0,50));
  assert.equal(mock.posts.length,1,'Other analysis launches remain blocked during the batch');
  mock.releases.shift()();await expect.poll(()=>mock.posts.length).toBe(2);await expect.poll(()=>mock.releases.length).toBe(1);
  await expect(page.locator('#title-suggestion')).toHaveText(mock.titles[first.name]);
  await expect(page.locator('#source-text')).toContainText(first.text.slice(0,50));
  await expect(page.locator('#file-list .is-selected')).toBeFocused();
  await expect(page.locator('#run-file-ai')).toBeDisabled();await expect(page.locator('#run-all-ai')).toBeDisabled();
  await page.locator('#run-file-ai').evaluate(button=>button.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await selectFile(page,second.name);await expect(page.locator('#title-suggestion')).toHaveText(secondLocal);
  mock.releases.shift()();await expect(page.locator('#title-suggestion')).toHaveText(mock.titles[second.name]);
  await expect(page.locator('#file-list .is-selected')).toBeFocused();
  await expect(page.locator('#run-file-ai')).toBeEnabled();await expect(page.locator('#run-all-ai')).toBeEnabled();
  assert.deepEqual(mock.posts.map(post=>post.fileName),[first.name,second.name]);
  await selectFile(page,first.name);await expect(page.locator('#title-suggestion')).toHaveText(mock.titles[first.name]);
  pass('Batch AI keeps source and suggestion paired and blocks overlapping launches for its entire duration');
  await context.close();
 }

 // Same stems, already suffixed stems and different extensions challenge both name allocators.
 {
  const {page,context,mock}=await createPage(url,{width:1440,height:960},'zip-collisions');
  const inputs=['qa-first.txt','qa-second.txt','qa-suffixed.txt','qa-other-format.md'].map((name,i)=>({name,mimeType:name.endsWith('.md')?'text/markdown':'text/plain',buffer:Buffer.from(`Emne: Syntetisk kollisjonskontroll\nDato: 27.09.2026\n\nUnikt byteinnhold for dokument ${i+1}.`)}));
  await page.locator('#file-input').setInputFiles(inputs);await idle(page,4);
  for(let i=0;i<inputs.length;i++){
   await selectFile(page,inputs[i].name);await field(page,'title').fill(i===2?'Fellespakke 2':'Fellespakke');await field(page,'documentDate').fill('2026-09-27');
  }
  const collisionZip=unzip((await download(page,'#download-zip')).bytes);
  const documents=[...collisionZip.entries()].filter(([name])=>name.startsWith('dokumenter/'));
  const sidecars=[...collisionZip.keys()].filter(name=>name.startsWith('metadata/'));
  assert.equal(documents.length,4);assert.equal(sidecars.length,4);
  assert.equal(new Set([...collisionZip.keys()].map(name=>name.toLowerCase())).size,collisionZip.size,'ZIP paths are unique ignoring case');
  const exportedOriginals=new Set();
  for(const [name,bytes] of documents){
   const stem=name.slice('dokumenter/'.length).replace(/\.[^.]+$/,'');
   const sidecar=collisionZip.get(`metadata/${stem}.metadata.json`);assert.ok(sidecar,`Matching sidecar for ${name}`);
   const metadata=JSON.parse(sidecar.toString('utf8'));const original=inputs.find(input=>input.name===metadata.originalFileName);assert.ok(original);
   assert.deepEqual(bytes,original.buffer);assert.equal(metadata.sha256,hash(bytes));exportedOriginals.add(metadata.originalFileName);
  }
  assert.equal(exportedOriginals.size,4);assert.equal(JSON.parse(collisionZip.get('manifest.json').toString('utf8')).fileCount,4);
  assert.equal(mock.posts.length,0);assert.equal(mock.health,0);
  pass('ZIP name collisions retain four unique documents and four matching sidecars without overwriting bytes');
  await context.close();
 }

 for(const width of [768,390,320]){
  const {page,context,mock}=await createPage(url,{width,height:900},`${width}px`);
  await noOverflow(page,`${width} px empty state`);
  const pasted='Emne: Syntetisk kontroll av innlimt tekst\nDato: 27.09.2026\n\nTestgrunnlag med norske tegn æ, ø og å. Dette er ikke en virkelig sak.';
  await page.locator('#paste-text').fill(pasted);await page.locator('#analyze-text').click();await idle(page,1);
  await expect(page.locator('#source-text')).toHaveText(pasted);
  await expect(page.locator('#source-text')).toHaveAttribute('tabindex','0');
  await page.locator('#source-text').focus();await expect(page.locator('#source-text')).toBeFocused();
  await field(page,'title').fill(`Kontrollert innlimt tekst ${width}`);
  await page.locator('#approve-title').click();await expect(page.locator('#title-review')).toHaveText('Godkjent');
  await noOverflow(page,`${width} px reviewed paste`);
  await screenshot(page,`paste-${width}`);
  await page.locator('#sample-button').click();await idle(page,4);
  assert.equal(await page.locator('#file-list .file-card').count(),4);
  const cards=page.locator('#file-list .file-card');
  await cards.first().focus();await page.keyboard.press('Enter');
  await expect(page.locator('#source-text')).toHaveText(pasted);await expect(field(page,'title')).toHaveValue(`Kontrollert innlimt tekst ${width}`);
  await details(page,'.metadata-details');await field(page,'caseReference').fill(`QA/${width}`);
  const mobileManifest=JSON.parse((await download(page,'#download-json')).bytes.toString('utf8'));
  const pastedRecord=mobileManifest.files.find(file=>file.title===`Kontrollert innlimt tekst ${width}`);
  assert.ok(pastedRecord);assert.equal(pastedRecord.caseReference,`QA/${width}`);
  await noOverflow(page,`${width} px examples and advanced fields`);
  assert.equal(mock.health,0);assert.equal(mock.turnstile,0);assert.equal(mock.posts.length,0);assert.deepEqual(mock.unexpected,[]);
  pass(`${width} px: paste, samples, keyboard source switch, approved edits and JSON export work locally`);
  await page.locator('#clear-button').click();await idle(page,0);
  await page.locator('#file-input').setInputFiles(first.path);await idle(page,1);await expect(page.locator('#source-text')).toContainText(first.text.trim().slice(0,50));
  pass(`${width} px: upload works after clearing`);await context.close();
 }
 assert.deepEqual(results.errors,[],'No browser exceptions or console errors');assert.deepEqual(results.missing,[],'No missing application resources');
 assert.ok(mocks.every(mock=>mock.unexpected.length===0),'No unexpected network request');
 assert.equal(mocks.reduce((n,mock)=>n+mock.posts.length,0),8,'Only explicitly requested analysis, failure/recovery checks and the two-document batch were submitted');
 assert.equal(results.remote.length,0,'No remote API, Turnstile or other outbound request was attempted');
 pass('All viewports complete without browser errors, missing assets or unintended network traffic');
 results.passed=results.checks.length;console.log(JSON.stringify({passed:results.passed,errors:results.errors,missing:results.missing}));
} catch(error) {
 results.failure=String(error);
 if(browser){let index=0;for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:resolve(out,`failure-${++index}.png`),fullPage:true,timeout:5000}).catch(()=>{});}
 throw error;
} finally {
 for(const mock of mocks)for(const release of mock.releases)release();
 await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2));
 await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
}
