import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateLearning} from '../scripts/validate-learning.mjs';
const load=name=>JSON.parse(readFileSync(new URL(`../cases/${name}.json`,import.meta.url),'utf8'));
const inputs=()=>['missions','leader-scenarios','investigation','cases'].map(load);
test('all published exercises have source boundaries, score explanations and chronological continuity',()=>assert.equal(validateLearning(...inputs()),true));
test('publishing rejects a reward inconsistent with its criteria and an unexplained score',()=>{
  const a=inputs(),option=a[0][0].options.find(o=>o.protected);option.assessment.followUp=1;
  assert.throws(()=>validateLearning(...a),/Læringsmerket/);
  option.assessment.followUp=2;option.assessment.nextStep='';assert.throws(()=>validateLearning(...a),/vurderingsgrunnlag/);
});
test('publishing rejects unsupported scenario links and ambiguous chronological order',()=>{
  const a=inputs();a[1][0].sourceCaseId='invented';assert.throws(()=>validateLearning(...a),/kildebro/);
  const b=inputs();b[2].evidence[1].chronologicalOrder=b[2].evidence[0].chronologicalOrder;assert.throws(()=>validateLearning(...b),/kronologiske/);
});
