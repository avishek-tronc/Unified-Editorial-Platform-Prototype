import os, re, base64, html, json, sys
from content import UC

NM = os.path.join(os.path.dirname(__file__), '..', 'node_modules')
OUT = os.path.join(os.path.dirname(__file__), 'out')
os.makedirs(OUT, exist_ok=True)

def lucide(name, size=24, color='currentColor', sw=2):
    s = open(f'{NM}/lucide-static/icons/{name}.svg').read()
    s = re.sub(r'<!--.*?-->', '', s, flags=re.S).strip()
    s = re.sub(r'class="[^"]*"', '', s)
    s = s.replace('width="24"', f'width="{size}"').replace('height="24"', f'height="{size}"')
    s = s.replace('stroke="currentColor"', f'stroke="{color}"').replace('stroke-width="2"', f'stroke-width="{sw}"')
    return s

def aws(name, size=34):
    p = f'{NM}/aws-icons/icons/architecture-service/{name}.svg'
    b = base64.b64encode(open(p, 'rb').read()).decode()
    return f'<img class="aws" src="data:image/svg+xml;base64,{b}" width="{size}" height="{size}"/>'

def simple(name, color, size=34, bg='#fff'):
    s = open(f'{NM}/simple-icons/icons/{name}.svg').read()
    path = re.search(r'<path d="([^"]+)"', s).group(1)
    return (f'<span class="logo" style="width:{size}px;height:{size}px;background:{bg}">'
            f'<svg viewBox="0 0 24 24" width="{size*0.7:.0f}" height="{size*0.7:.0f}"><path fill="{color}" d="{path}"/></svg></span>')

def textlogo(t, bg, fg='#fff', size=34):
    fs = 13 if size>=34 else 11
    return f'<span class="tlogo" style="font-size:{fs}px;height:{size}px;background:{bg};color:{fg}">{t}</span>'

def logo(name, size=34):
    if name == '@claude':
        return simple('claude', '#D97757', size, '#FBF1EC')
    if name == '@orcid':
        return simple('orcid', '#A6CE39', size, '#F3F9E6')
    if name == '@crossref':
        return textlogo('Crossref', '#3EB1C8', size=size)
    if name == '@ithenticate':
        return textlogo('iThenticate', '#1F4E79', size=size)
    if name == '@chronosub':
        return textlogo('Chronosub', '#5B6B7F', size=size)
    return aws(name, size)

LBL={'AmazonSimpleStorageService':'S3','AmazonTextract':'Textract','AmazonComprehend':'Comprehend','AmazonEventBridge':'EventBridge','AmazonSimpleQueueService':'SQS',
'AmazonElasticKubernetesService':'EKS','AmazonBedrockAgentCore':'AgentCore','AmazonBedrock':'Bedrock','@claude':'Claude','AmazonDynamoDB':'DynamoDB','AmazonElastiCache':'ElastiCache',
'AmazonOpenSearchService':'OpenSearch','AmazonAPIGateway':'API Gateway','AmazonAurora':'Aurora','@crossref':'','AWSStepFunctions':'Step Functions','@orcid':'ORCID','@ithenticate':'',
'AmazonSimpleEmailService':'SES','@chronosub':'','AmazonNeptune':'Neptune','AmazonSageMaker':'SageMaker','AmazonCloudWatch':'CloudWatch'}
NAVY = '#14287A'; BLUE = '#1F3FBF'; INK = '#1B2540'; MUTED = '#55617A'

BASE_CSS = f"""
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:'Inter',sans-serif;color:{INK};background:#fff;width:2000px;padding:28px 30px 30px}}
.hdr{{display:flex;align-items:center;gap:22px;margin-bottom:22px}}
.tile{{width:84px;height:84px;border-radius:22px;background:linear-gradient(135deg,{NAVY},#3B5BDB);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(20,40,122,.25)}}
.kicker{{font-size:15px;font-weight:700;letter-spacing:.12em;color:#3B5BDB;text-transform:uppercase}}
.title{{font-size:40px;font-weight:800;color:{NAVY};line-height:1.1;margin-top:2px}}
.subt{{font-size:18px;color:{MUTED};margin-top:6px;max-width:1350px}}
.powered{{margin-left:auto;display:flex;align-items:center;gap:10px;border:1.5px solid #D9E0F2;border-radius:16px;padding:10px 16px;background:#F7F9FE}}
.powered .lbl{{font-size:12px;font-weight:700;color:{MUTED};letter-spacing:.08em;text-transform:uppercase;margin-right:4px;line-height:1.25}}
.logo{{display:inline-flex;align-items:center;justify-content:center;border-radius:8px}}
.tlogo{{display:inline-flex;align-items:center;padding:0 9px;border-radius:7px;font-size:13px;font-weight:800;letter-spacing:.01em}}
.aws{{border-radius:7px;display:block}}
.panel{{border:1.5px solid #D3DBF0;border-radius:20px;padding:18px 20px;margin-bottom:18px;background:#FAFBFF}}
.ptitle{{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:800;color:{NAVY};letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px}}
"""

def header(u, kind):
    kick = f'POC {u["n"]} · ' + ('Functional flow &amp; architecture' if kind == 'f' else 'Technical process flow')
    return f"""<div class="hdr"><div class="tile">{lucide(u['icon'],46,'#fff',2)}</div>
<div><div class="kicker">{kick}</div><div class="title">{html.escape(u['title'])}</div><div class="subt">{html.escape(u['sub'])}</div></div>
<div class="powered"><div class="lbl">Runs on<br/>Base AI Framework</div>{aws('AmazonBedrockAgentCore',40)}{aws('AmazonBedrock',40)}{simple('claude','#D97757',40,'#FBF1EC')}</div></div>"""

# ---------------- functional figure ----------------
F_CSS = BASE_CSS + f"""
.personas{{display:flex;align-items:center;gap:14px;padding:14px 20px}}
.personas .ptitle{{margin:0 14px 0 0}}
.pchip{{display:flex;align-items:center;gap:10px;border:1.5px solid #C9D3EE;background:#fff;border-radius:40px;padding:6px 18px 6px 6px;font-weight:700;font-size:17px;color:{NAVY}}}
.pchip .av{{width:38px;height:38px;border-radius:50%;background:#E7ECFB;display:flex;align-items:center;justify-content:center}}
.flow{{display:flex;align-items:stretch}}
.card{{flex:1;position:relative;background:#fff;border:2px solid #CBD5F0;border-radius:18px;padding:16px 16px 18px;display:flex;flex-direction:column}}
.card.ai{{background:linear-gradient(160deg,#16297F,#2C4BD1);border-color:#1E3399;color:#fff}}
.card.dec{{border:2px dashed #E09B1A;background:#FFFBF2}}
.ctop{{display:flex;align-items:center;gap:10px;margin-bottom:12px}}
.num{{width:32px;height:32px;border-radius:50%;background:{NAVY};color:#fff;font-weight:800;font-size:16px;display:flex;align-items:center;justify-content:center;flex:none}}
.card.ai .num{{background:#fff;color:{NAVY}}}
.actor{{font-size:12.5px;white-space:nowrap;font-weight:700;padding:4px 9px;border-radius:20px;background:#EEF2FC;color:{NAVY}}}
.card.ai .actor{{background:rgba(255,255,255,.16);color:#fff}}
.aib{{margin-left:auto;display:flex;align-items:center;gap:4px;font-size:12px;font-weight:800;background:#FFD666;color:#4A3200;border-radius:12px;padding:3px 8px}}
.cicon{{width:60px;height:60px;border-radius:16px;background:#EDF1FD;display:flex;align-items:center;justify-content:center;margin-bottom:12px}}
.card.ai .cicon{{background:rgba(255,255,255,.14)}}
.card.dec .cicon{{background:#FFEBC2;transform:rotate(45deg);border-radius:12px;width:52px;height:52px;margin:4px 0 16px 4px}}
.card.dec .cicon svg{{transform:rotate(-45deg)}}
.ctitle{{font-size:19px;font-weight:800;margin-bottom:6px}}
.cdesc{{font-size:15px;line-height:1.42;color:{MUTED}}}
.card.ai .cdesc{{color:#DCE3FF}}
.outc{{margin-top:10px;display:flex;flex-direction:column;gap:6px}}
.oc{{font-size:13.5px;font-weight:700;border-radius:10px;padding:6px 9px;display:flex;gap:6px;align-items:center}}
.oc.y{{background:#E3F6EA;color:#1C6B3A}} .oc.n{{background:#FFF0D6;color:#8A5300}}
.arrow{{width:34px;flex:none;display:flex;align-items:center;justify-content:center}}
.params{{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}}
.pc{{background:#fff;border:2px solid #CBD5F0;border-radius:18px;padding:16px;display:flex;gap:14px}}
.pc .pi{{width:58px;height:58px;border-radius:16px;background:linear-gradient(135deg,#16297F,#2C4BD1);display:flex;align-items:center;justify-content:center;flex:none}}
.pc .pn{{font-size:18px;font-weight:800;color:{NAVY};margin-bottom:6px}}
.pc .pl{{font-size:14px;line-height:1.4;color:{MUTED};margin-bottom:3px}}
.pc .pl b{{color:{INK}}}
.wbar{{margin-top:8px;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:{NAVY}}}
.wbar .bar{{flex:1;height:9px;border-radius:5px;background:#E4E9F7;overflow:hidden}}
.wbar .bar i{{display:block;height:100%;background:linear-gradient(90deg,#2C4BD1,#6A8BFF)}}
.pnote{{margin-top:12px;font-size:14px;color:{MUTED};display:flex;align-items:center;gap:8px}}
.arch{{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}}
.col{{background:#fff;border:1.5px solid #CBD5F0;border-radius:16px;overflow:hidden}}
.colh{{display:flex;align-items:center;gap:10px;background:{NAVY};color:#fff;font-weight:800;font-size:17px;padding:12px 16px}}
.col.ai .colh{{background:linear-gradient(90deg,#2C4BD1,#5B7CFA)}}
.items{{padding:12px;display:flex;flex-direction:column;gap:9px}}
.it{{display:flex;align-items:center;gap:11px;background:#F4F6FD;border-radius:11px;padding:9px 11px;font-size:15px;line-height:1.3}}
.it .ii{{width:32px;height:32px;border-radius:9px;background:#fff;border:1px solid #DCE3F5;display:flex;align-items:center;justify-content:center;flex:none}}
.it b{{color:{INK}}} .it span{{color:{MUTED}}}
.hitl{{display:flex;align-items:center;gap:16px;background:linear-gradient(90deg,{NAVY},#2C4BD1);color:#fff;border-radius:18px;padding:16px 22px;font-size:17px;line-height:1.45}}
.hitl .hi{{width:46px;height:46px;border-radius:12px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;flex:none}}
"""

def functional(u):
    pers = ''.join(f'<div class="pchip"><span class="av">{lucide(i,22,NAVY)}</span>{html.escape(t)}</div>' for i, t in u['personas'])
    cards = []
    for k, (actor, ic, t, d, ai) in enumerate(u['steps'], 1):
        dec = u.get('decision') == k - 1 + 0 and False
        isdec = (actor == 'Decision')
        cls = 'card ai' if ai else ('card dec' if isdec else 'card')
        col = '#fff' if ai else ('#B36B00' if isdec else BLUE)
        aib = f'<span class="aib">{lucide("sparkles",13,"#4A3200",2.4)}AI</span>' if ai else ''
        body = f'<div class="cdesc">{html.escape(d)}</div>'
        if isdec:
            yes, no = d.split(' No: ')
            yes = yes.replace('Yes: ', '')
            body = (f'<div class="outc"><div class="oc y">{lucide("check",15,"#1C6B3A",3)}Yes · {html.escape(yes)}</div>'
                    f'<div class="oc n">{lucide("user-check",15,"#8A5300",2.6)}No · {html.escape(no)}</div></div>')
        cards.append(f'<div class="{cls}"><div class="ctop"><span class="num">{k}</span><span class="actor">{html.escape(actor if not isdec else "Platform")}</span>{aib}</div>'
                     f'<div class="cicon">{lucide(ic,32,col,2)}</div><div class="ctitle">{html.escape(t)}</div>{body}</div>')
    arrow = f'<div class="arrow">{lucide("chevron-right",30,BLUE,3)}</div>'
    flow = arrow.join(cards)
    params = ''
    if u.get('params'):
        pcs = ''.join(f'<div class="pc"><div class="pi">{lucide(i,30,"#fff")}</div><div style="flex:1"><div class="pn">{html.escape(n)}</div>'
                      f'<div class="pl"><b>{html.escape(g.split(":")[0])}:</b>{html.escape(g.split(":",1)[1])}</div>'
                      f'<div class="pl"><b>{html.escape(s.split(":")[0])}:</b>{html.escape(s.split(":",1)[1]) if ":" in s else html.escape(s)}</div>'
                      f'<div class="wbar">Weight<div class="bar"><i style="width:{int(w[:-1])*2.5}%"></i></div>{w}</div></div></div>'
                      for i, n, g, s, w in u['params'])
        params = (f'<div class="panel"><div class="ptitle">{lucide("sliders-horizontal",20,NAVY)}Reviewer selection parameters</div><div class="params">{pcs}</div>'
                  f'<div class="pnote">{lucide("info",16,MUTED)}Gates remove a Reviewer from the proposal; the weighted score ranks the rest. Conflict of interest is always a hard exclusion. Weights are proposed defaults, configurable per journal.</div></div>')
    cols = []
    for k, (h, hi, items) in enumerate(u['arch']):
        its = ''.join(f'<div class="it"><span class="ii">{lucide(i,18,BLUE)}</span><div><b>{html.escape(a)}</b> <span>{html.escape(b)}</span></div></div>' for i, a, b in items)
        cols.append(f'<div class="col{" ai" if k==2 else ""}"><div class="colh">{lucide(hi,20,"#fff")}{html.escape(h)}</div><div class="items">{its}</div></div>')
    body = f"""{header(u,'f')}
<div class="panel personas"><div class="ptitle">{lucide('users',20,NAVY)}Personas</div>{pers}</div>
<div class="panel"><div class="ptitle">{lucide('workflow',20,NAVY)}Functional flow</div><div class="flow">{flow}</div></div>
{params}
<div class="panel"><div class="ptitle">{lucide('blocks',20,NAVY)}Functional architecture</div><div class="arch">{''.join(cols)}</div></div>
<div class="hitl"><span class="hi">{lucide('shield-check',26,'#fff')}</span><div><b>Human in the loop:</b> {html.escape(u['hitl'])}</div></div>"""
    return f'<html><head><meta charset="utf-8"><style>{F_CSS}</style></head><body>{body}</body></html>'

# ---------------- process figure ----------------
LANES = [
 ('ui', 'Personas &amp; UI', 'Editor Triage Platform', 'monitor-smartphone', '#E6EEFF', '#2F5BEA'),
 ('svc', 'TR microservices', 'EKS on Fargate', 'boxes', '#E3F5F1', '#0F8A6E'),
 ('evt', 'Events &amp; orchestration', 'EventBridge · SQS · Step Functions', 'zap', '#FFF3E0', '#D97706'),
 ('ai', 'Agentic AI', 'Bedrock AgentCore · Claude · SageMaker', 'sparkles', '#F1EBFF', '#7444E0'),
 ('data', 'Data &amp; integrations', 'Stores · vendors · email', 'database', '#EEF1F6', '#4B5B73'),
]
P_CSS = BASE_CSS + f"""
.swim{{position:relative;border:1.5px solid #D3DBF0;border-radius:20px;overflow:hidden;margin-bottom:18px}}
.lane{{display:flex;height:212px;border-bottom:1.5px solid #fff}}
.lane:last-child{{border-bottom:none}}
.lh{{width:190px;flex:none;padding:18px 16px;display:flex;flex-direction:column;justify-content:center;gap:6px;color:#fff}}
.lh .ln{{font-size:18px;font-weight:800;display:flex;align-items:center;gap:8px}}
.lh .ls{{font-size:13px;opacity:.9;line-height:1.3}}
.lb{{flex:1;position:relative}}
.node{{position:absolute;top:14px;width:160px;min-height:170px;overflow-wrap:break-word;background:#fff;border-radius:14px;border:2px solid;padding:10px 10px 8px;box-shadow:0 3px 10px rgba(20,40,122,.08);z-index:2}}
.nb{{position:absolute;top:-11px;left:-11px;width:30px;height:30px;border-radius:50%;color:#fff;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;border:2.5px solid #fff}}
.nic{{display:flex;gap:6px;margin-bottom:7px;align-items:center;flex-wrap:wrap}}
.svc{{font-size:11px;font-weight:700;color:#7A869E;line-height:1.25;margin:-2px 0 5px}}
.nn{{font-size:14.5px;font-weight:800;line-height:1.2;margin-bottom:4px}}
.na{{font-size:12.8px;line-height:1.33;color:{MUTED}}}
svg.wires{{position:absolute;left:0;top:0;z-index:1;pointer-events:none}}
.bottom{{display:grid;grid-template-columns:1.25fr 1fr;gap:18px}}
.leg{{display:flex;flex-wrap:wrap;gap:12px 22px;font-size:15px;color:{INK}}}
.leg .li{{display:flex;align-items:center;gap:8px}}
.leg .sw{{width:20px;height:20px;border-radius:6px}}
.crit{{display:flex;flex-direction:column;gap:10px}}
.crit div{{display:flex;gap:10px;align-items:flex-start;font-size:16px;line-height:1.35}}
"""

def wb(t):
    t = html.escape(t)
    t = re.sub(r'\.(?=[a-z])', '.<wbr>', t)
    t = re.sub(r'(?<=[a-z])(?=[A-Z])', '<wbr>', t)
    return t

def process(u):
    steps = u['proc']
    n = len(steps)
    lane_idx = {l[0]: i for i, l in enumerate(LANES)}
    lb_w = 2000 - 60 - 3 - 190
    colw = lb_w / n
    lanes_html = []
    for li, (key, name, sub, ic, bg, fg) in enumerate(LANES):
        nodes = ''
        for k, (lane, nm, icons, act) in enumerate(steps, 1):
            if lane != key: continue
            x = colw * (k - 1) + (colw - 160) / 2
            ics = ''.join(logo(i, 30 if len(icons)>2 else 34) for i in icons)
            nodes += (f'<div class="node" id="n{k}" style="left:{x:.1f}px;border-color:{fg}"><span class="nb" style="background:{fg}">{k}</span>'
                      f'<div class="nic">{ics}</div><div class="svc">{" · ".join(x for x in (LBL.get(i,i) for i in icons) if x) or "&nbsp;"}</div><div class="nn">{wb(nm)}</div><div class="na">{wb(act)}</div></div>')
        lanes_html.append(f'<div class="lane" style="background:{bg}"><div class="lh" style="background:{fg}"><div class="ln">{lucide(ic,22,"#fff")}{name}</div><div class="ls">{sub}</div></div><div class="lb">{nodes}</div></div>')
    legend = ''.join(f'<div class="li"><span class="sw" style="background:{fg}"></span>{name}</div>' for key, name, sub, ic, bg, fg in LANES)
    legend += f'<div class="li">{lucide("arrow-right",20,NAVY,2.4)}Step order (numbered)</div>'
    crit = ''.join(f'<div>{lucide("circle-check",22,"#1C8A4A",2.2)}<span>{html.escape(c)}</span></div>' for c in u['criteria'])
    js = """
const sw=document.querySelector('.swim'), r0=sw.getBoundingClientRect();
const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('class','wires');
svg.setAttribute('width',r0.width); svg.setAttribute('height',r0.height);
svg.innerHTML='<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#14287A"/></marker></defs>';
const N=document.querySelectorAll('.node').length;
for(let k=1;k<N;k++){const a=document.getElementById('n'+k).getBoundingClientRect(), b=document.getElementById('n'+(k+1)).getBoundingClientRect();
 const x1=a.right-r0.left, y1=a.top+a.height/2-r0.top, x2=b.left-r0.left-3, y2=b.top+b.height/2-r0.top, mx=(x1+x2)/2;
 const p=document.createElementNS('http://www.w3.org/2000/svg','path');
 const d = Math.abs(y1-y2)<1 ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} L${mx-8},${y1} Q${mx},${y1} ${mx},${y1+(y2>y1?8:-8)} L${mx},${y2-(y2>y1?8:-8)} Q${mx},${y2} ${mx+8},${y2} L${x2},${y2}`;
 p.setAttribute('d',d); p.setAttribute('fill','none'); p.setAttribute('stroke','#14287A'); p.setAttribute('stroke-width','2.6'); p.setAttribute('marker-end','url(#ah)');
 svg.appendChild(p);}
sw.appendChild(svg);
"""
    body = f"""{header(u,'p')}
<div class="swim">{''.join(lanes_html)}</div>
<div class="bottom">
<div class="panel" style="margin:0"><div class="ptitle">{lucide('map',20,NAVY)}How to read this</div>
<div style="font-size:16px;line-height:1.5;color:{MUTED};margin-bottom:12px">Follow the numbered steps left to right. Each row is a layer of the TR solution architecture (sections 6 to 8); each card names the component and the AWS service or vendor it runs on.</div><div class="leg">{legend}</div></div>
<div class="panel" style="margin:0"><div class="ptitle">{lucide('trophy',20,NAVY)}POC success criteria (proposed)</div><div class="crit">{crit}</div></div>
</div><script>{js}</script>"""
    return f'<html><head><meta charset="utf-8"><style>{P_CSS}</style></head><body>{body}</body></html>'

if __name__ == '__main__':
    for u in UC:
        open(f'{OUT}/uc{u["n"]}_f.html', 'w').write(functional(u))
        open(f'{OUT}/uc{u["n"]}_p.html', 'w').write(process(u))
    print('ok')
