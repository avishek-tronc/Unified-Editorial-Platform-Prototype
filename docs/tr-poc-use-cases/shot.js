const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:2000,height:800},deviceScaleFactor:+process.argv[3]||1});
for(const f of process.argv[2].split(',')){await p.goto('file://'+__dirname+'/out/'+f+'.html');await p.waitForTimeout(300);
await p.screenshot({path:__dirname+'/out/'+f+'.png',fullPage:true});}
await b.close();})();
