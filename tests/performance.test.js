import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from '../modules/performance.js';
import { kickoff } from '../modules/data.js';
const game = { game_id: 'a', season: 2026, home_team: 'GB', away_team: 'CHI', week: 4, gameday: '2026-10-04', gametime: '13:00', status: 'final', home_score: 24, away_score: 10 };
const prediction = { winner: 'GB', p: .7, models: [{ id: 'margin', p: .8 }, { id: 'neutral', p: .5 }], motifs: ['alignment'] };
const options = { games: [game], predictions: new Map([['a', prediction]]), records: [], lens: 'precog', version: '1' };
const record = { recording: 'automatic', game: 'a', lens: 'precog', version: '1', home: 'GB', away: 'CHI', probabilityHome: .3, createdAt: '2026-10-01T00:00:00Z', cutoff: '2026-10-01T00:00:00Z', kickoff: kickoff(game), sourceCollectedAt: '2026-09-30T00:00:00Z', models: [{id:'margin',p:.2}], motifs: [] };
test('retrospective success never becomes a recorded success', () => {
  assert.equal(performance(options).calls, 0);
  const historical = performance({...options,mode:'historical'});
  assert.equal(historical.correct, 1);
  assert.equal(historical.teams.find(t=>t.name==='CHI').correct, 1);
  assert.equal(historical.models.find(t=>t.name==='neutral').n, 0);
  const saved = performance({...options,records:[record]});
  assert.equal(saved.correct, 0);
  assert.equal(saved.incorrect, 1);
  assert.equal(saved.models[0].correct, 0);
});
test('ties, abstentions, pending games, wrong versions and invalid records are not scored', () => {
  assert.equal(performance({...options, games:[{...game,away_score:24}],mode:'historical'}).ties, 1);
  assert.equal(performance({...options,predictions:new Map([['a',{...prediction,p:null,winner:null}]]),mode:'historical'}).calls, 0);
  const pending = performance({...options,games:[{...game,status:'scheduled'}],mode:'historical'});
  assert.equal(pending.pending, 1); assert.equal(pending.n, 0);
  assert.equal(performance({...options,records:[{...record,version:'other'}]}).calls, 0);
  const invalid = performance({...options,records:[{...record,createdAt:'2026-10-05T00:00:00Z'}]});
  assert.equal(invalid.n,0); assert.equal(invalid.unscored,1);
});
