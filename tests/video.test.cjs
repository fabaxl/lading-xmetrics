const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {selectVideoVariant} = require('../static/js/landing-video.js');
const root = path.join(__dirname,'..');
test('selects one portrait, square or landscape variant for representative screens', () => {
  for (const [width,height,variant] of [[390,844,'portrait'],[320,568,'portrait'],[768,1024,'square'],[1024,768,'square'],[1440,900,'landscape'],[1920,1080,'landscape'],[844,390,'landscape']]) {
    assert.equal(selectVideoVariant(width,height),variant);
  }
});
test('single accessible player is lazy, controllable and has no autoplay',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const videos=[...html.matchAll(/<video\b([^>]*)>/g)];
  assert.equal(videos.length,1);
  assert.match(videos[0][1],/controls/);
  assert.match(videos[0][1],/playsinline/);
  assert.match(videos[0][1],/preload="none"/);
  assert.doesNotMatch(videos[0][1],/autoplay|\bsrc=/);
  for(const variant of ['portrait','square','landscape']) {
    for(const ext of ['jpg','mp4']) assert.ok(fs.existsSync(path.join(root,`static/video/how-it-works-${variant}.${ext}`)));
  }
});
test('only selected source loads on open; close pauses and releases media',()=>{
  const events={},buttonEvents={},windowEvents={}; let loads=0,pauses=0;
  const frame={dataset:{}};
  const dialog={open:false,dataset:{},querySelector:()=>frame,addEventListener:(name,cb)=>events[name]=cb};
  const video={currentTime:0,paused:true,preload:'none',duration:24,pause:()=>pauses++,load:()=>loads++,addEventListener:()=>{},removeAttribute:(name)=>delete video[name]};
  const button={addEventListener:(name,cb)=>buttonEvents[name]=cb};
  const context={document:{getElementById:id=>id==='tour-dialog'?dialog:video,querySelectorAll:()=>[button]},window:{innerWidth:390,innerHeight:844,addEventListener:(name,cb)=>windowEvents[name]=cb},clearTimeout:()=>{},setTimeout:cb=>cb()};
  vm.runInNewContext(fs.readFileSync(path.join(root,'static/js/landing-video.js'),'utf8'),context);
  assert.equal(loads,0);assert.equal(video.src,undefined);
  dialog.open=true;buttonEvents.click();
  assert.equal(loads,1);assert.match(video.src,/portrait.mp4$/);assert.equal(dialog.dataset.videoFormat,'portrait');
  windowEvents.resize();assert.equal(loads,1);
  context.window.innerWidth=1440;context.window.innerHeight=900;windowEvents.resize();
  assert.equal(loads,2);assert.match(video.src,/landscape.mp4$/);
  dialog.open=false;events.close();assert.equal(video.src,undefined);assert.equal(video.preload,'none');assert.ok(pauses>=3);
});
