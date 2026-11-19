(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Scout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 1;
  const STORAGE_KEY = 'audiencescout.workspace.v1';
  const FIELDS = ['respondent', 'segment', 'needs', 'painPoints', 'interests', 'motivation', 'channels', 'intent', 'notes', 'method', 'date', 'source'];
  const LABELS = {respondent:'Respondent ID', segment:'Customer segment', needs:'Needs', painPoints:'Pain points', interests:'Interests', motivation:'Purchase motivation', channels:'Preferred channels', intent:'Purchase intent (1–5)', notes:'Additional notes', method:'Research method', date:'Response date', source:'Data source'};
  const CHANNELS = ['Instagram', 'Email', 'YouTube', 'Google Search', 'TikTok', 'Podcasts', 'Facebook', 'LinkedIn', 'Reddit', 'Word of mouth', 'Local events'];
  const id = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'scout-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const now = () => new Date().toISOString();
  const clone = value => JSON.parse(JSON.stringify(value));
  const text = (value, max=5000) => String(value == null ? '' : value).trim().slice(0,max);
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  function newProject(name='Untitled research', kind='research') {
    return {id:id(), name:text(name,120)||'Untitled research', kind, createdAt:now(), updatedAt:now(), setup:{product:'',market:'',characteristics:'',goals:'',assumptions:''}, responses:[], planner:null, actions:{}, experimentNotes:''};
  }
  function normalizeChannels(input) {
    const aliases = {ig:'Instagram',instagram:'Instagram',email:'Email',newsletter:'Email',newsletters:'Email',youtube:'YouTube',yt:'YouTube',google:'Google Search','google search':'Google Search',search:'Google Search',tiktok:'TikTok',podcast:'Podcasts',podcasts:'Podcasts',facebook:'Facebook',fb:'Facebook',linkedin:'LinkedIn',reddit:'Reddit','word of mouth':'Word of mouth',referral:'Word of mouth',referrals:'Word of mouth','local events':'Local events'};
    const values=(Array.isArray(input)?input:String(input||'').split(/[;|,\n]/)).map(v=>text(v,80)).filter(Boolean).map(v=>/^(none|no channels?|no preference|n\/a)$/i.test(v)?'None':aliases[v.toLowerCase()]||v);
    const unique=new Map();for(const v of values)if(!unique.has(v.toLowerCase()))unique.set(v.toLowerCase(),v);
    return [...unique.values()].slice(0,30);
  }
  function response(input, kind='research') {
    for(const field of FIELDS){const limit=field==='respondent'?120:field==='segment'?160:5000;if(!Array.isArray(input[field])&&String(input[field]??'').trim().length>limit)throw new Error(`${LABELS[field]} exceeds ${limit} characters. Shorten the value before importing.`);}
    const rawChannels=Array.isArray(input.channels)?input.channels:String(input.channels||'').split(/[;|,\n]/);
    if(rawChannels.filter(v=>String(v).trim()).length>30||rawChannels.some(v=>String(v).trim().length>80))throw new Error('Use at most 30 channel values, with up to 80 characters each.');
    const r = {id:input.id||id()};
    for (const field of FIELDS) r[field] = text(input[field]);
    r.respondent = text(input.respondent,120);
    r.segment = text(input.segment,160);
    r.channels = normalizeChannels(input.channels);
    if(r.channels.includes('None')&&r.channels.length>1)throw new Error('“None” cannot be combined with a selected channel. Clarify the response first.');
    const intent = text(input.intent);
    if (intent && !/^[1-5]$/.test(intent)) throw new Error('Purchase intent must be a whole number from 1 to 5, or blank.');
    r.intent = intent ? Number(intent) : null;
    if (r.date && (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || Number.isNaN(Date.parse(r.date+'T00:00:00Z')) || new Date(r.date+'T00:00:00Z').toISOString().slice(0,10)!==r.date)) throw new Error('Response date must be a valid date in YYYY-MM-DD format.');
    r.method = ['survey','interview','other'].includes(r.method.toLowerCase()) ? r.method.toLowerCase() : 'other';
    const source = text(input.source).toLowerCase();
    if (source && !['sample','real','research'].includes(source)) throw new Error('Data source must be real or sample.');
    if (kind==='research' && source==='sample') throw new Error('Sample responses belong in a sample project. They cannot be mixed with real research.');
    if (kind==='sample' && source && source!=='sample') throw new Error('Real responses cannot be added to a sample project.');
    r.source = kind==='sample' ? 'sample' : 'real';
    if (!['needs','painPoints','interests','motivation','notes'].some(f=>r[f]) && !r.channels.length && r.intent===null) throw new Error('Include at least one answer, preferred channel, or purchase intent.');
    return r;
  }
  function fingerprint(r) { return JSON.stringify(FIELDS.filter(f=>f!=='source').map(f=>f==='channels'?[...r.channels].sort():r[f])); }
  function analyze(project, segment='') {
    const rows = project.responses.filter(r=>!segment||r.segment===segment);
    const channelRows = rows.filter(r=>r.channels.length);
    const counts = new Map();
    for (const row of channelRows) for (const channel of new Set(row.channels)) if(channel!=='None') counts.set(channel,(counts.get(channel)||0)+1);
    const channels = [...counts].map(([name,count])=>({name,count,percent:Math.round(count/channelRows.length*100)})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
    const themes = {};
    for (const field of ['needs','painPoints','interests','motivation']) {
      const answered = rows.filter(r=>r[field]);
      themes[field] = {answered:answered.length,unmatched:answered.length,groups:[]};
    }
    const intents = rows.filter(r=>r.intent!==null);
    return {total:rows.length,rows,channelAnswered:channelRows.length,channelMissing:rows.length-channelRows.length,channels,themes,intentAnswered:intents.length,intentAverage:intents.length?Number((intents.reduce((s,r)=>s+r.intent,0)/intents.length).toFixed(1)):null,intentDistribution:[1,2,3,4,5].map(value=>({value,count:intents.filter(r=>r.intent===value).length})),segments:[...new Set(project.responses.map(r=>r.segment).filter(Boolean))].sort()};
  }
  function planner(project) {
    const s = project.setup;
    const product = s.product || project.name;
    const audience = s.market || 'your intended customers';
    return {generatedAt:now(),context:JSON.stringify(s),survey:[
      {type:'Screening · open text',question:`What is your role or situation, and how does it relate to ${audience}?${s.characteristics?' In your own words, how does this describe your experience: '+s.characteristics+'?':''}`,field:'segment'},
      {type:'Open text',question:`Thinking about a product like ${product}, what outcome would be most useful to you?`,field:'needs'},
      {type:'Open text',question:'What is the hardest part of getting that outcome today? Please describe a recent example.',field:'painPoints'},
      {type:'Open text',question:'What topics or activities do you choose to spend time on related to this need?',field:'interests'},
      {type:'Open text',question:'Tell us about the last time you bought a similar product. What made you choose it?',field:'motivation'},
      {type:'Multiple choice · allow multiple + Other + None',question:'Where do you prefer to discover or learn about products like this? Select only the channels you actually use.',field:'channels'},
      {type:'Scale · 1 very unlikely to 5 very likely · optional',question:`Based on what you know so far, how likely are you to consider ${product}? Choose “not sure” if you need more information.`,field:'intent'},
      {type:'Open text · optional',question:'What would stop you from trying this product? What would you need to learn first?',field:'notes'},
      {type:'Research goal · open text · optional',question:`We want to ${s.goals||'understand customer needs and channel preferences'}. What recent experience could help us understand this?`,field:'notes'}
    ],interview:[
      {type:'Context',question:`Tell me about your current situation as it relates to ${audience}.`,field:'segment'},
      {type:'Recent behavior',question:`Walk me through the last time you needed an outcome that ${product} aims to provide.`,field:'needs'},
      {type:'Pain point probe',question:'Where did you get stuck? What did that cost you in time, effort, or money?',field:'painPoints'},
      {type:'Existing alternatives',question:'What have you already tried? What worked, and what was missing?',field:'notes'},
      {type:'Discovery',question:'How did you find the last product you tried? Where did you look for advice?',field:'channels'},
      {type:'Interests',question:'Which related topics do you follow, and what keeps you coming back to them?',field:'interests'},
      {type:'Purchase decision',question:'What prompted your most recent purchase? Who or what influenced the decision?',field:'motivation'},
      {type:'Validation',question:`Our research goal is: ${s.goals||'understand customer needs and channel preferences'}. What experience of yours could help us understand this better?`,field:'notes'},
      {type:'Close',question:'What have I missed? May I contact you for a short follow-up?',field:'notes'}
    ]};
  }
  function parseCSV(raw) {
    if (typeof raw!=='string') throw new Error('The file must contain CSV text.');
    if (raw.length>5*1024*1024) throw new Error('Choose a CSV smaller than 5 MB.');
    const input=raw.replace(/^\uFEFF/,'');
    if (!input.trim()) throw new Error('This CSV is empty.');
    const first=input.split(/\r?\n/)[0];
    const delimiter=first.includes('\t')?'\t':',';
    const rows=[]; let row=[],value='',quoted=false,closed=false;
    for(let i=0;i<input.length;i++) {
      const ch=input[i];
      if(quoted) { if(ch==='"') {if(input[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=ch; }
      else if(ch==='"') {if(value.length||closed)throw new Error('Invalid CSV quotes. Use double quotes around fields containing commas or line breaks.');quoted=true;}
      else if(ch===delimiter){row.push(value);value='';closed=false;}
      else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&input[i+1]==='\n')i++;row.push(value);if(row.some(v=>v.trim()))rows.push(row);row=[];value='';closed=false;}
      else {if(closed&&!/\s/.test(ch))throw new Error('Unexpected text after a closing quote.');if(!closed)value+=ch;}
    }
    if(quoted)throw new Error('A quoted field is not closed. Check the CSV and try again.');
    row.push(value);if(row.some(v=>v.trim()))rows.push(row);
    if(rows.length<2)throw new Error('Include a header row and at least one response.');
    const headers=rows.shift().map(h=>h.trim());
    if(headers.some(h=>!h)||new Set(headers.map(h=>h.toLowerCase())).size!==headers.length)throw new Error('CSV headers must be non-empty and unique.');
    if(headers.length>60)throw new Error('This CSV has too many columns. Keep up to 60 columns.');
    if(rows.length>5000)throw new Error('Import up to 5,000 responses at a time.');
    return {headers,rows,delimiter};
  }
  function autoMap(headers) {
    const aliases={respondent:['respondent','respondentid','id','name'],segment:['segment','customersegment'],needs:['needs','need','customerneeds'],painPoints:['painpoints','painpoint','challenges','problems'],interests:['interests','interest'],motivation:['motivation','purchasemotivation','motivations'],channels:['channels','channel','preferredchannels','channelpreferences'],intent:['intent','purchaseintent','purchaseintent15'],notes:['notes','additionalnotes'],method:['method','researchmethod'],date:['date','responsedate'],source:['source','datasource']};
    const map={};for(const f of FIELDS)map[f]=headers.findIndex(h=>aliases[f].includes(h.toLowerCase().replace(/[^a-z0-9]/g,'')));return map;
  }
  function previewImport(parsed,map,project) {
    const used=Object.values(map).filter(v=>v>=0);
    if(new Set(used).size!==used.length)throw new Error('Map each CSV column to only one field.');
    const good=[],errors=[],duplicates=[];
    const seen=new Set(project.responses.map(fingerprint));
    parsed.rows.forEach((row,index)=>{
      try {
        if(row.length!==parsed.headers.length)throw new Error(`Expected ${parsed.headers.length} columns, found ${row.length}.`);
        const raw={};for(const f of FIELDS)if(map[f]>=0)raw[f]=row[map[f]];
        // Source labels are safety metadata: honor them even if their mapping was removed.
        const sourceColumn=autoMap(parsed.headers).source;
        if(sourceColumn>=0&&text(row[sourceColumn]).toLowerCase()==='sample')raw.source='sample';
        const r=response(raw,project.kind);
        const fp=fingerprint(r);
        if(seen.has(fp)){duplicates.push(index+2);return;}seen.add(fp);good.push(r);
      }catch(e){errors.push({row:index+2,message:e.message});}
    });
    return {good,errors,duplicates,total:parsed.rows.length};
  }
  function csvCell(value) {
    let s=String(value==null?'':value);
    if(/^[\s]*[=+@-]/.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  }
  function toCSV(rows) {return '\uFEFF'+[FIELDS.map(csvCell).join(','),...rows.map(r=>FIELDS.map(f=>csvCell(Array.isArray(r[f])?r[f].join('; '):r[f])).join(','))].join('\r\n');}
  function validateWorkspace(data) {
    if(!data||data.schemaVersion!==VERSION||!Array.isArray(data.projects)||!data.projects.length||data.projects.length>50)throw new Error('This is not a supported AudienceScout backup (version 1, up to 50 projects).');
    const projects=data.projects.map(p=>{
      if(!p||typeof p.name!=='string'||!['sample','research'].includes(p.kind)||!Array.isArray(p.responses)||p.responses.length>10000)throw new Error('A project in this backup has invalid data.');
      const safe=newProject(p.name,p.kind);safe.id=text(p.id,100)||id();safe.createdAt=text(p.createdAt,40)||now();safe.updatedAt=text(p.updatedAt,40)||now();
      for(const f of Object.keys(safe.setup))safe.setup[f]=text(p.setup&&p.setup[f]);
      safe.responses=p.responses.map(r=>{if(!r||typeof r!=='object')throw new Error('Invalid response in backup.');return response(r,p.kind);});
      if(new Set(safe.responses.map(r=>r.id)).size!==safe.responses.length)throw new Error('Duplicate response identifiers in backup.');
      if(p.planner){
        if(!Array.isArray(p.planner.survey)||!Array.isArray(p.planner.interview))throw new Error('Invalid research planner in backup.');
        safe.planner={generatedAt:text(p.planner.generatedAt,40),context:text(p.planner.context,30000)};
        for(const mode of ['survey','interview'])safe.planner[mode]=p.planner[mode].slice(0,40).map(q=>({type:text(q.type,150),question:text(q.question,2000),field:FIELDS.includes(q.field)?q.field:'notes'}));
      }
      safe.actions=Object.fromEntries(Object.entries(p.actions||{}).filter(([key,value])=>key.length<150&&typeof value==='boolean'));
      safe.experimentNotes=text(p.experimentNotes,10000);return safe;
    });
    if(new Set(projects.map(p=>p.id)).size!==projects.length)throw new Error('Duplicate project identifiers in backup.');
    return {schemaVersion:VERSION,activeId:projects.some(p=>p.id===data.activeId)?data.activeId:projects[0].id,projects,updatedAt:text(data.updatedAt,40)||now()};
  }
  function sampleProject(which='coffee') {
    const coffee=which==='coffee',p=newProject(coffee?'Everyday Coffee':'Studio Flow','sample');
    p.setup={product:coffee?'A flexible specialty coffee subscription':'A simple scheduling tool for independent fitness instructors',market:coffee?'Busy coffee drinkers who brew at home':'Independent fitness instructors and small studios',characteristics:coffee?'Time-conscious home brewers who value consistent quality':'Owner-operators who manage classes and client bookings',goals:'Understand recurring customer needs and identify channels to test.',assumptions:coffee?'Customers may prefer flexible deliveries to fixed subscriptions. This has not been validated.':'Instructors may value simpler scheduling over more features. This has not been validated.'};
    for(let i=0;i<24;i++) {
      const channels=[];
      if(i<16)channels.push(coffee?'Instagram':'LinkedIn');
      if(i>=8&&i<21)channels.push('Email');
      if(i%2===0&&i<20)channels.push('YouTube');
      if(i%3===0)channels.push('Google Search');
      if(i%4===0)channels.push(coffee?'TikTok':'Facebook');
      if(i>=20)channels.push('Podcasts');
      p.responses.push(response({respondent:`Sample ${String(i+1).padStart(2,'0')}`,segment:coffee?(i<14?'Daily home brewers':'Weekend explorers'):(i<14?'Independent instructors':'Studio owners'),needs:coffee?['Quick delivery that saves time in a busy week.','Consistent quality and transparent information about the beans.','Flexible delivery dates and a simple way to change my order.'][i%3]:['An easy way to manage my busy class schedule.','Reliable bookings and clear customer communication.','Flexible scheduling with simple setup.'][i%3],painPoints:coffee?['Delivery takes too much time and the schedule is unreliable.','Good beans are expensive; the price is hard to justify.','Subscriptions are complicated to cancel or change.','It is hard to trust quality before trying a new brand.'][i%4]:['Managing schedule changes takes too much time.','Existing tools are expensive for a small studio.','Setup is complicated and customer support is slow.','Booking reminders are unreliable.'][i%4],interests:coffee?['Brewing tutorials and new coffee recipes.','Sustainable packaging and reducing waste.','Local coffee events and learning from other home brewers.'][i%3]:['Teaching tips and business tutorials.','Community events and connecting with instructors.','Learning better ways to manage my studio.'][i%3],motivation:['I would choose a product with trustworthy reviews and consistent quality.','Saving time matters more than having lots of options.','A fair price and a flexible plan would make me consider it.'][i%3],channels,intent:1+(i%5),method:i<18?'survey':'interview',date:'',source:'sample',notes:'Fictional response created for product demonstration. Not market evidence.'},'sample'));
    }
    return p;
  }
  function initialState(){const p=sampleProject();return {schemaVersion:VERSION,activeId:p.id,projects:[p],updatedAt:now()};}
  return {VERSION,STORAGE_KEY,FIELDS,LABELS,CHANNELS,id,now,clone,text,escape,newProject,response,fingerprint,normalizeChannels,analyze,planner,parseCSV,autoMap,previewImport,toCSV,validateWorkspace,sampleProject,initialState};
});
