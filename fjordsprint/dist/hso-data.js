/** Curated hospital/campus directory, checked against official sources 2026-10-16.
 * Locations are playful mountain landmarks, NOT geographic or building replicas.
 * Includes the nine hospital trusts and the four named long-term nonprofit partners;
 * not every clinic, DPS, rehabilitation unit or private contractual provider. */
export const HSO_DATE='2026-10-16';
export const LOGO_SOURCE='https://www.helse-sorost.no/om-oss/media/logo-og-profilprogram';
export const HSO_SOURCE='https://www.helse-sorost.no/behandlingssteder/';
export const REGION_ROUTES=['AGDER · TELEMARK · VESTFOLD','OSLO · AKERSHUS · ØSTFOLD','INNLANDET · VESTRE VIKEN'];
export const PROVIDERS={
 sshf:{name:'Sørlandet sykehus HF',source:HSO_SOURCE},
 sthf:{name:'Sykehuset Telemark HF',source:'https://www.sthf.no/behandlingssteder/'},
 siv:{name:'Sykehuset i Vestfold HF',source:'https://www.siv.no/om-oss/jobb/leger-i-spesialisering-lis/vare-spesialistutdanninger/fordoyelsessykdommer'},
 ous:{name:'Oslo universitetssykehus HF',source:'https://www.oslo-universitetssykehus.no/om-oss/parkering-pa-oslo-universitetssykehus/'},
 ahus:{name:'Akershus universitetssykehus HF',source:'https://www.ahus.no/behandlingssteder/'},
 so:{name:'Sykehuset Østfold HF',source:'https://www.sykehuset-ostfold.no/steder/sykehuset-ostfold-kalnes/'},
 sun:{name:'Sunnaas sykehus HF',source:HSO_SOURCE},
 si:{name:'Sykehuset Innlandet HF',source:'https://www.sykehuset-innlandet.no/om-oss/vi-er-sykehuset-innlandet/'},
 vv:{name:'Vestre Viken HF',source:'https://www.vestreviken.no/steder/'},
 bet:{name:'Betanien Hospital',source:HSO_SOURCE,nonprofit:true},
 dia:{name:'Diakonhjemmet Sykehus',source:HSO_SOURCE,nonprofit:true},
 lov:{name:'Lovisenberg Diakonale Sykehus',source:HSO_SOURCE,nonprofit:true},
 rev:{name:'Revmatismesykehuset',source:HSO_SOURCE,nonprofit:true}
};
// Name, operator, building vocabulary; campus status is explicit where needed.
const routes=[
 [
  ['Sørlandet sykehus Flekkefjord','sshf','coastal'],
  ['Sørlandet sykehus Kristiansand','sshf','modern'],
  ['Sørlandet sykehus Arendal','sshf','tower'],
  ['Sykehuset Telemark – Kragerø','sthf','coastal'],
  ['Sykehuset Telemark – Skien','sthf','modern'],
  ['Betanien Hospital','bet','heritage'],
  ['Sykehuset Telemark – Porsgrunn','sthf','brick'],
  ['Sykehuset Telemark – Notodden','sthf','brick'],
  ['Sykehuset Telemark – Rjukan','sthf','heritage','Behandlingssted'],
  ['Sykehuset Telemark – Seljord','sthf','coastal','DPS / behandlingssted'],
  ['Sykehuset Telemark – Bamble','sthf','coastal','Behandlingssted'],
  ['Sykehuset i Vestfold – Tønsberg','siv','tower'],
  ['Sykehuset i Vestfold – Larvik','siv','brick'],
  ['Kysthospitalet i Stavern','siv','coastal']
 ],
 [
  ['Sykehuset Østfold Kalnes','so','modern'],
  ['Sykehuset Østfold Moss','so','tower'],
  ['Ski sykehus','ahus','brick'],
  ['Ahus Nordbyhagen','ahus','modern'],
  ['Ahus Gardermoen','ahus','modern'],
  ['Kongsvinger sykehus','ahus','tower'],
  ['Aker sykehus','ous','brick'],
  ['Ullevål sykehus','ous','heritage'],
  ['Rikshospitalet','ous','modern'],
  ['Radiumhospitalet','ous','tower'],
  ['Gaustad sykehus','ous','heritage'],
  ['Dikemark sykehus','ous','heritage','Sykehusområde; virksomhet under flytting i 2026'],
  ['Spesialsykehuset for epilepsi (SSE)','ous','coastal'],
  ['Sunnaas sykehus','sun','coastal'],
  ['Diakonhjemmet Sykehus','dia','brick'],
  ['Lovisenberg Diakonale Sykehus','lov','heritage']
 ],
 [
  ['Drammen sykehus – Brakerøya','vv','modern'],
  ['Bærum sykehus','vv','tower'],
  ['Martina Hansens Hospital','vv','heritage'],
  ['Kongsberg sykehus','vv','brick'],
  ['Ringerike sykehus','vv','modern'],
  ['Hallingdal sjukestugu','vv','coastal','Lokalmedisinsk senter'],
  ['Sykehuset Innlandet – Gjøvik','si','tower'],
  ['Sykehuset Innlandet – Lillehammer','si','tower'],
  ['Revmatismesykehuset','rev','brick'],
  ['Sykehuset Innlandet – Hamar','si','brick'],
  ['Sykehuset Innlandet – Elverum','si','modern'],
  ['Sykehuset Innlandet – Tynset','si','coastal'],
  ['Sykehuset Innlandet – Sanderud','si','heritage'],
  ['Sykehuset Innlandet – Reinsvoll','si','heritage']
 ]
];
export const HOSPITALS=Object.freeze(routes.flatMap((route,course)=>route.map(([name,provider,style,note],i)=>Object.freeze({id:`hso-${course}-${i}`,name,provider,style,course,note:note||'Sykehus',q:.045+i*.905/(route.length-1)}))));
export function hospitalsForCourse(id){const index=typeof id==='number'?id:['fjord','pass','aurora'].indexOf(id);return HOSPITALS.filter(h=>h.course===index);}
export const DIRECTORY_NOTES=[
 {text:'Drammen vises på Brakerøya. Tidligere Blakstad-funksjoner er flyttet dit.',url:'https://www.vestreviken.no/podkast/lederpraten-i-vestre-viken/lederpraten-i-vestre-viken-s2e05-espen-bjorkenes--tekstversjon/'},
 {text:'Martina Hansens Hospital er del av Vestre Viken fra november 2025.',url:'https://www.vestreviken.no/steder/martina-hansens-hospital/'},
 {text:'Dikemark er med som sykehusområde i en overgangsperiode, ikke som et løfte om framtidig drift.',url:'https://www.oslo-universitetssykehus.no/om-oss/arsrapport-2024/'}
];
