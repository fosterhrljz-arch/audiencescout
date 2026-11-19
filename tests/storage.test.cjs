const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const S=require('../intelligence.js');
const code=fs.readFileSync(require.resolve('../app.js'),'utf8');
function harness(initial,options={}){
  let stored=initial,writes=0;
  const events={},elements=new Map();
  function element(key){if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',className:'',open:false,classList:{add(){},remove(){}},showModal(){this.open=true;},close(){this.open=false;},addEventListener(){},setAttribute(){},focus(){},scrollIntoView(){}});return elements.get(key);}
  const document={title:'',activeElement:null,querySelector:element,addEventListener:(type,fn)=>{(events[type]??=[]).push(fn);},contains:()=>false};
  const localStorage={getItem(){if(options.readBlocked)throw Error('Denied');return stored;},setItem(key,value){if(options.writeBlocked)throw Error('QuotaExceededError');stored=value;writes++;}};
  const window={Scout:S,ScoutViews:require('../views.js'),ScoutWorkbench:require('../workbench.js'),addEventListener(){},scrollTo(){},location:{reload(){}},print(){}};
  const context={window,document,localStorage,location:{hash:options.hash||''},history:{replaceState(){}},setTimeout:()=>0,clearTimeout(){},FormData:class{constructor(form){this.data=form.values;}get(k){return this.data[k]??null;}getAll(k){return this.data[k]||[];}*[Symbol.iterator](){yield* Object.entries(this.data);}},URL,Blob};
  vm.runInNewContext(code,context);
  return {element,get stored(){return stored;},get writes(){return writes;},externalChange(value){stored=value;},submit(id,values){const form={id,values,dataset:{}};events.submit.forEach(fn=>fn({preventDefault(){},target:form}));}};
}
test('unreadable storage is never overwritten during startup',()=>{const h=harness('{broken json');assert.equal(h.stored,'{broken json');assert.equal(h.writes,0);assert.match(h.element('#dialog').innerHTML,/needs recovery/);});
test('blocked local storage enters explicit session-only mode',()=>{const h=harness(null,{readBlocked:true});assert.match(h.element('#app').innerHTML,/Browser storage is unavailable/);h.submit('new-project-form',{name:'Session project'});assert.match(h.element('#app').innerHTML,/Session project/);assert.equal(h.writes,0);assert.match(h.element('#toast').textContent,/session only/);});
test('quota failure preserves the previous stored workspace',()=>{const initial=JSON.stringify(S.initialState());const h=harness(initial,{writeBlocked:true});h.submit('new-project-form',{name:'Unsaved project'});assert.equal(h.stored,initial);assert.equal(h.writes,0);assert.match(h.element('#toast').textContent,/previous saved data is intact/);});
test('concurrent edits cannot overwrite a newer stored workspace',()=>{const initial=S.initialState();const h=harness(JSON.stringify(initial));const other=S.clone(initial);other.projects[0].name='Newer name';const newer=JSON.stringify(other);h.externalChange(newer);h.submit('new-project-form',{name:'Stale edit'});assert.equal(h.stored,newer);assert.equal(h.writes,0);assert.match(h.element('#app').innerHTML,/changed in another window/);});
test('successful save retains prior projects and creates a real research project',()=>{const h=harness(JSON.stringify(S.initialState()));h.submit('new-project-form',{name:'My research'});const stored=S.validateWorkspace(JSON.parse(h.stored));assert.equal(stored.projects.length,2);assert.equal(stored.projects[1].name,'My research');assert.equal(stored.projects[1].kind,'research');assert.equal(stored.projects[0].kind,'sample');});
test('legacy project notes remain accessible before completing a discovery brief',()=>{const p=S.newProject('Legacy');delete p.discovery;p.experimentNotes='Original research notes';p.actions={old:true};const h=harness(JSON.stringify({schemaVersion:1,activeId:p.id,projects:[p],updatedAt:S.now()}),{hash:'#insights'});assert.match(h.element('#app').innerHTML,/Original research notes/);assert.match(h.element('#app').innerHTML,/Earlier checklist records/);h.submit('experiment-form',{notes:'Original research notes plus a correction'});const saved=JSON.parse(h.stored);assert.equal(saved.schemaVersion,3);assert.equal(saved.projects[0].experimentNotes,'Original research notes plus a correction');assert.equal(saved.projects[0].actions.old,true);});
