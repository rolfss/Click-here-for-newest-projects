import * as THREE from './vendor/three.module.js';
// Features share one distance axis. Place each boost field on an open stretch,
// keep bird choices out of hard braking zones, and leave the ramp landings clear.
export const courses = [
  {
    id: 'fjord', name: 'Fjordlinjen', region: 'VESTLANDET', subtitle: 'Fra fjord til fjell',
    description: 'Lær flyten langs fjorden. Brede svinger, raske utforkjøringer og ett luftig svev.',
    difficulty: '01 / FLYT', color: '#79e9d2', sky: 0xaccfda, fog: 0xb7d2d8, ground: 0x5b7966, sun: 0xffe6b8,
    width: 28, medals: [54, 66, 88],
    quiz: [.209, .502, .715], jumps: [.603], pads: [.104, .451, .790], birds: [.335, .867],
    trolls: [.061, .144, .176, .249, .292, .377, .414, .548, .662, .754, .829, .927],
    points: [
      [0,62,150], [0,65,-70], [65,98,-290], [151,135,-506], [98,153,-704],
      [-55,135,-856], [-161,98,-1050], [-130,87,-1260], [25,125,-1470],
      [141,181,-1690], [117,205,-1918], [-9,170,-2160], [-91,112,-2425], [0,80,-2680]
    ]
  },
  {
    id: 'pass', name: 'Tindepasset', region: 'JOTUNHEIMEN', subtitle: 'Over skyene',
    description: 'Klatre gjennom hårnåler, hopp mellom tindene og finn bremselinjen på vei ned.',
    difficulty: '02 / TEKNIKK', color: '#ffb87a', sky: 0xb5c5df, fog: 0xc5cee4, ground: 0x737e86, sun: 0xffd9ae,
    width: 28, medals: [80, 98, 128],
    quiz: [.208, .397, .759], jumps: [.342, .646], pads: [.065, .445, .932], birds: [.119, .505, .812],
    trolls: [.033, .092, .164, .241, .308, .370, .472, .551, .603, .707, .877, .962],
    points: [
      [0,145,140], [0,156,-105], [-100,202,-330], [-170,255,-535], [-40,286,-677],
      [105,278,-650], [235,318,-755], [210,378,-925], [25,411,-1170], [-105,377,-1412],
      [-18,330,-1640], [170,293,-1820], [252,270,-2028], [116,213,-2260], [-45,175,-2480],
      [-40,182,-2755], [20,230,-2980]
    ]
  },
  {
    id: 'aurora', name: 'Nordlysryggen', region: 'NORD-NORGE', subtitle: 'Den siste etappen',
    description: 'Kjør i skumringen over broer og eksponerte rygger. Bevar fart, kunnskap og kontroll.',
    difficulty: '03 / PRESISJON', color: '#b9a6ff', sky: 0x344560, fog: 0x58627d, ground: 0x536875, sun: 0xb9c9ff,
    width: 27, medals: [76, 96, 126],
    quiz: [.205, .466, .765], jumps: [.397, .667], pads: [.064, .436, .909], birds: [.121, .273, .521, .833],
    trolls: [.036, .091, .165, .236, .303, .342, .492, .568, .606, .718, .790, .872],
    points: [
      [0,95,160], [0,110,-108], [112,176,-342], [260,216,-535], [194,241,-752], [-35,221,-902],
      [-174,161,-1112], [-60,132,-1330], [144,177,-1560], [248,259,-1800], [167,328,-2025],
      [-18,300,-2207], [-171,263,-2440], [-110,190,-2692], [70,150,-2926], [153,182,-3140], [70,235,-3370]
    ]
  }
];
const clamp=THREE.MathUtils.clamp;
export class Track {
 constructor(config){this.config=config;this.curve=new THREE.CatmullRomCurve3(config.points.map(p=>new THREE.Vector3(...p)),false,'catmullrom',.35);this.curve.arcLengthDivisions=3000;this.length=this.curve.getLength();this.count=Math.ceil(this.length/3);this.samples=[];for(let i=0;i<=this.count;i++){const u=i/this.count,p=this.curve.getPointAt(u),t=this.curve.getTangentAt(u),r=new THREE.Vector3(-t.z,0,t.x).normalize();this.samples.push({p,t,r,yaw:Math.atan2(t.x,-t.z)});}this.runoffLength=420;this.roadLength=this.length+this.runoffLength;this.roadSamples=[...this.samples];for(let d=3;d<this.runoffLength;d+=3)this.roadSamples.push(this.at(this.length+d));this.roadSamples.push(this.at(this.roadLength));this.checkpoints=config.quiz.map(q=>q*this.length);this.jumps=config.jumps.map(q=>q*this.length);this.pads=config.pads.map(q=>q*this.length);}
 at(s){if(s>this.length){const end=this.samples[this.count],d=Math.min(s-this.length,this.runoffLength||420),flat=new THREE.Vector3(end.t.x,0,end.t.z).normalize(),grade=end.t.y/Math.hypot(end.t.x,end.t.z),y=grade*65*(1-Math.exp(-d/65)),p=end.p.clone().addScaledVector(flat,d);p.y+=y;const t=flat.clone();t.y=grade*Math.exp(-d/65);t.normalize();return {p,t,r:end.r.clone(),yaw:end.yaw};}const f=clamp(s/this.length,0,1)*this.count,i=Math.min(this.count-1,Math.floor(f)),a=f-i,A=this.samples[i],B=this.samples[i+1];const t=A.t.clone().lerp(B.t,a).normalize(),r=A.r.clone().lerp(B.r,a).normalize();return {p:A.p.clone().lerp(B.p,a),t,r,yaw:Math.atan2(t.x,-t.z)};}
 distanceToRoad(x,z){let best=Infinity;const samples=this.roadSamples||this.samples;for(let i=1;i<samples.length;i++){const a=samples[i-1].p,b=samples[i].p,dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);best=Math.min(best,(x-a.x-dx*t)**2+(z-a.z-dz*t)**2);}return Math.sqrt(best);}
 position(s,x=0,height=0){const f=this.at(s);return f.p.addScaledVector(f.r,x).add(new THREE.Vector3(0,height,0));}
 rampHeight(s){for(const jump of this.jumps)if(s>jump-28&&s<jump)return (s-jump+28)/28*3.2;return 0;}
 curvature(s){const a=this.at(s),b=this.at(s+5);return angle(b.yaw-a.yaw)/5;}
}
export function angle(v){return Math.atan2(Math.sin(v),Math.cos(v));}
export function formatTime(t){if(!Number.isFinite(t))return '—';const c=Math.max(0,Math.round(t*100));return Math.floor(c/6000).toString().padStart(2,'0')+':'+Math.floor(c%6000/100).toString().padStart(2,'0')+'.'+(c%100).toString().padStart(2,'0');}
