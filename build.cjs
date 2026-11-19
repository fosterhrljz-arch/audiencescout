// Maintainer utility only. End users double-click AudienceScout.html.
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
let html = fs.readFileSync(path.join(root,'index.html'),'utf8');
html = html.replace('<link rel="stylesheet" href="styles.css">',()=>'<style>\n'+fs.readFileSync(path.join(root,'styles.css'),'utf8')+'\n</style>');
html = html.replace('<link rel="stylesheet" href="discovery.css">',()=>'<style>\n'+fs.readFileSync(path.join(root,'discovery.css'),'utf8')+'\n</style>');
html = html.replace('<link rel="stylesheet" href="workbench.css">',()=>'<style>\n'+fs.readFileSync(path.join(root,'workbench.css'),'utf8')+'\n</style>');
for (const file of ['core.js','discovery.js','research-rules.js','intelligence.js','views.js','workbench.js','app.js']) html = html.replace(`<script src="${file}"></script>`,()=>'<script>\n'+fs.readFileSync(path.join(root,file),'utf8').replace(/<\/script/gi,'<\\/script')+'\n</script>');
fs.writeFileSync(path.join(root,'AudienceScout.html'),html);
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
fs.writeFileSync(path.join(root,'dist','index.html'),html);
console.log('Built self-contained AudienceScout.html ('+Buffer.byteLength(html)+' bytes).');
