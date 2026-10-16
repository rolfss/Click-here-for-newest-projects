import {RaceAudio as BaseAudio} from './audio.js';
/** Short, filtered water sounds. Uses the existing volume and voice cleanup. */
export class RaceAudio extends BaseAudio{
 cue(name){if(!['water','splash'].includes(name))return super.cue(name);if(!this.ctx||this._suspended||this.ctx.state!=='running')return;
 const at=this.ctx.currentTime+.005;if(at-(this._lastCue.get(name)??-100)<.12)return;this._lastCue.set(name,at);
 this._noiseHit(at,name==='water'?.12:.19,name==='water'?.065:.09,'bandpass',name==='water'?1700:900,this.fxBus);
 }
}
