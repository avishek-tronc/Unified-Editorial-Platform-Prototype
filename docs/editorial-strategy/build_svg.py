import sys; sys.path.insert(0,'.')
from usecases import ROWS, MODULES
from xml.sax.saxutils import escape as E
W,Hh=3200,1640
C={"GR":"#0F766E","IA":"#B45309","TR":"#1D4ED8","RD":"#7C3AED","SIC":"#334155","OI":"#15803D","CW":"#6B7280","WC":"#6B7280"}
LIGHT={"GR":"#ECFDF5","IA":"#FFFBEB","TR":"#EFF6FF","RD":"#F5F3FF","SIC":"#F1F5F9","OI":"#F0FDF4"}
o=[]
def t(x,y,s,size=14,fill="#111827",w="normal",anchor="start",italic=False):
    o.append(f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{w}" text-anchor="{anchor}"{" font-style=\"italic\"" if italic else ""}>{E(s)}</text>')
def rect(x,y,w,h,fill,stroke,rx=10,dash=None,sw=2):
    o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{f" stroke-dasharray=\"{dash}\"" if dash else ""}/>')
def line(x1,y1,x2,y2,col="#374151",dash=None,head=True,both=False,sw=2.2):
    o.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{col}" stroke-width="{sw}"{f" stroke-dasharray=\"{dash}\"" if dash else ""}{" marker-end=\"url(#ah)\"" if head else ""}{" marker-start=\"url(#ahs)\"" if both else ""}/>')
def path(d,col="#374151",dash=None):
    o.append(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="2.2"{f" stroke-dasharray=\"{dash}\"" if dash else ""} marker-end="url(#ah)"/>')
def label(x,y,lines,size=13,fill="#111827",bg="#FFFFFF",w=None):
    lw=w or max(len(l) for l in lines)*size*0.56+12; lh=size+4; h=len(lines)*lh+6
    rect(x-lw/2,y-h/2,lw,h,bg,"#D1D5DB",rx=6,sw=1)
    for i,l in enumerate(lines): t(x,y-h/2+lh*(i+1)-1,l,size,fill,"normal","middle")
def items(code): return [r for r in ROWS if r[0]==code]
def item_list(code,x,y,w,cols=1,colw=None,lh=27,boff=34):
    rs=items(code); colw=colw or w; per=-(-len(rs)//cols)
    for i,r in enumerate(rs):
        cx=x+(i//per)*colw; cy=y+(i%per)*lh
        mvp=r[5]=="YES"
        o.append(f'<circle cx="{cx+8}" cy="{cy-5}" r="6" fill="{"#16A34A" if mvp else "#FFFFFF"}" stroke="{"#16A34A" if mvp else "#9CA3AF"}" stroke-width="2"/>')
        t(cx+22,cy,r[2],14,"#111827" if mvp else "#4B5563")
        p=r[3][0]; pc={"M":"#B91C1C","S":"#D97706","N":"#6B7280"}[p]
        rect(cx+colw-boff,cy-16,24,20,"#FFFFFF",pc,rx=4,sw=1.5); t(cx+colw-boff+12,cy-1,p,12,pc,"bold","middle")
o.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{Hh}" viewBox="0 0 {W} {Hh}" font-family="Segoe UI, Helvetica, Arial, sans-serif">')
o.append('<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#374151"/></marker><marker id="ahs" markerWidth="10" markerHeight="10" refX="1" refY="5" orient="auto"><path d="M10,0 L0,5 L10,10 z" fill="#374151"/></marker></defs>')
rect(0,0,W,Hh,"#FFFFFF","#FFFFFF",rx=0)
t(60,52,"Unified Editorial Platform: Editorial Strategy functional workflow (8 modules)",30,"#111827","bold")
t(60,82,"Schematic view of the primary use cases per module and how they hand off to each other. Source: GR v1, SIC v1, IA v1, TR v4, RD v1, OI v1. Contextual Workspaces and Workflow Coordination: requirement docs not available (TBD).",15,"#4B5563")
# CW band
rect(60,110,W-120,96,"#F9FAFB",C["CW"],dash="10 6")
t(80,142,"CONTEXTUAL WORKSPACES (CW)  ·  TBD, requirement doc not available",17,"#374151","bold")
t(80,170,"Participant-facing layer: each module's output is presented in role-specific workspaces (presentation, reading/annotation, context).",14,"#4B5563",italic=True)
for i,(role,sub) in enumerate([("Author workspace","guidance, readiness, intent"),("Editor workspace","queue, context, integrity report"),("Reviewer workspace","manuscript version, review"),("Staff / Ops workspace","exceptions, escalations"),("Product / GTS","insight & experiments")]):
    x=1300+i*370; rect(x,124,332,66,"#FFFFFF","#9CA3AF",rx=8,sw=1.2); t(x+166,151,role,15,"#111827","bold","middle"); t(x+166,174,sub,13,"#6B7280","normal","middle")
# columns
cols=[("GR","1","Guidance & Readiness","Author prepares & submits"),("IA","2","Integrity Assurance","Screen manuscript & people"),("TR","3","Triage & Routing","Assign, assess, transfer"),("RD","4","Reviewer Discovery","Find & select reviewers")]
X0,CW_,GAP,Y0,CH=60,450,110,400,640
xs={}
for i,(code,n,name,sub) in enumerate(cols):
    x=X0+i*(CW_+GAP); xs[code]=x
    rect(x,Y0,CW_,CH,LIGHT[code],C[code])
    o.append(f'<path d="M{x} {Y0+10} a10 10 0 0 1 10 -10 h{CW_-20} a10 10 0 0 1 10 10 v62 h-{CW_} z" fill="{C[code]}"/>')
    o.append(f'<circle cx="{x+34}" cy="{Y0+36}" r="20" fill="#FFFFFF"/>'); t(x+34,Y0+43,n,20,C[code],"bold","middle")
    t(x+66,Y0+32,f"{name} ({code})",19,"#FFFFFF","bold"); t(x+66,Y0+56,sub,14,"#E5E7EB")
    item_list(code,x+16,Y0+104,CW_-28)
# terminal
TX=X0+4*(CW_+GAP); TW=300
OX=TX+TW+50; OW=W-60-OX
rect(TX,Y0+150,TW,300,"#FFFFFF","#111827",dash="6 4")
t(TX+TW/2,Y0+190,"Peer review &",18,"#111827","bold","middle"); t(TX+TW/2,Y0+214,"editorial decision",18,"#111827","bold","middle")
for i,s in enumerate(["Invitations, reviews, decision","executed via WC + CW","","Revision  →  back to GR / IA","(re-check affected items)","","Accept  →  Production","(SIC production continuity)"]):
    t(TX+TW/2,Y0+250+i*22,s,14,"#4B5563","normal","middle")
# adjacent arrows
ay=Y0+150
adj=[("GR","IA",["Submission +","readiness","status"]),("IA","TR",["Consolidated","integrity","report/status"]),("TR","RD",["Handling Editor","+ advance to","peer review"])]
for a,b,lab in adj:
    x1=xs[a]+CW_; x2=xs[b]; line(x1+4,ay,x2-4,ay); label((x1+x2)/2,ay+52,lab,12,w=112)
line(xs["RD"]+CW_+4,ay,TX-4,ay); label((xs["RD"]+CW_+TX)/2,ay+52,["Primary +","alternate","reviewers"],12,w=112)
# arcs above
def arc(a,b,yt,lab,col="#374151",lx=None):
    x1=xs[a]+CW_*0.7; x2=xs[b]+CW_*0.3
    path(f"M{x1} {Y0-2} C {x1} {yt}, {x2} {yt}, {x2} {Y0-4}",col)
    label(lx or (x1+x2)/2,yt+22,[lab],13)
arc("GR","TR",250,"Author intent, acceptable journals & routing authorisation")
arc("IA","RD",300,"COI / sanctions / identity results → reviewer eligibility",lx=1250)
# TR transfer self-loop
xT=xs["TR"]
path(f"M{xT+CW_-30} {Y0-2} C {xT+CW_-30} {Y0-70}, {xT+CW_+60} {Y0-70}, {xT+CW_+40} {Y0+60}","#1D4ED8")
label(xT+CW_+100,Y0-100,["Transfer / reroute to","another ACS journal"],12,"#1D4ED8")
# return loops below columns
yb=Y0+CH
path(f"M{xs['TR']+CW_*0.25} {yb+2} C {xs['TR']+CW_*0.25} {yb+60}, {xs['GR']+CW_*0.45} {yb+60}, {xs['GR']+CW_*0.45} {yb+4}","#B91C1C","7 5")
label((xs['TR']+xs['GR']+CW_*0.7)/2, yb+62,["Return to author: readiness fix (focused correction)"],12,"#B91C1C")
path(f"M{xs['IA']+CW_*0.75} {yb+2} C {xs['IA']+CW_*0.75} {yb+30}, {xs['GR']+CW_*0.62} {yb+30}, {xs['GR']+CW_*0.62} {yb+4}","#B45309","7 5")
t(xs['IA']+75, yb+40,"Determinations → readiness impact",12,"#B45309")
# WC band
WY=yb+130
rect(60,WY,OX-90,92,"#F9FAFB",C["WC"],dash="10 6")
t(80,WY+32,"WORKFLOW COORDINATION (WC)  ·  TBD, requirement doc not available",17,"#374151","bold")
t(80,WY+60,"Orchestration layer owning scheduling, reminders, handoffs, SLAs, escalation and process execution (as assigned by the other docs).",14,"#4B5563",italic=True)
for code,lab in [("GR","readiness actions / reviews"),("IA","risk-based escalation (IA-16)"),("TR","handoffs, reassignment"),("RD","invite sequencing, timeouts")]:
    x=xs[code]+60; line(x,yb+4,x,WY-4); t(x+10,WY-14,lab,12,"#374151")
# SIC band
SY=WY+120
rect(60,SY,OX-90,170,LIGHT["SIC"],C["SIC"])
o.append(f'<path d="M60 {SY+10} a10 10 0 0 1 10 -10 h{OX-110} a10 10 0 0 1 10 10 v40 h-{OX-90} z" fill="{C["SIC"]}"/>')
t(80,SY+33,"STRUCTURED INFORMATION & CONTINUITY (SIC)  ·  information foundation used by every module",18,"#FFFFFF","bold")
t(OX-50,SY+33,"▲ authoritative content, versions, change signals, provenance      ▼ findings, decisions, history",14,"#E5E7EB","normal","end")
item_list("SIC",80,SY+84,OX-130,cols=5,colw=(OX-130)/5,lh=30,boff=110)
for code in xs:
    x=xs[code]+CW_-60; line(x,yb+4,x,SY-4,"#334155","5 4",both=True)
# OI column

rect(OX,220,OW,SY+170-220,LIGHT["OI"],C["OI"])
o.append(f'<path d="M{OX} {230} a10 10 0 0 1 10 -10 h{OW-20} a10 10 0 0 1 10 10 v62 h-{OW} z" fill="{C["OI"]}"/>')
t(OX+16,252,"Operational Intelligence (OI)",19,"#FFFFFF","bold"); t(OX+16,276,"Observes the whole flow",14,"#E5E7EB")
item_list("OI",OX+14,330,OW-24)
t(OX+16,820,"Inputs: events & evidence from",13,"#15803D","bold"); t(OX+16,840,"GR, IA, TR, RD, WC, SIC",13,"#15803D")
t(OX+16,872,"Outputs: capacity & workload",13,"#15803D","bold"); t(OX+16,892,"context to TR + RD; insight",13,"#15803D"); t(OX+16,912,"and experiment results",13,"#15803D")
# evidence bus into OI
by=Y0-14
line(xs["GR"]+20,by,OX-4,by,"#15803D","5 4")
t(xs["GR"]+30,by-8,"evidence →  OI",12,"#15803D","bold")
for code in xs: line(xs[code]+20,Y0,xs[code]+20,by,"#15803D","5 4",head=False)
line(OX-4,WY+46,2840-2780+2780- (2840-OX) - 0,WY+46,"#15803D","5 4",head=False) if False else None
# legend
LY=SY+200
rect(60,LY,W-120,120,"#FFFFFF","#D1D5DB",sw=1)
t(80,LY+32,"Legend",16,"#111827","bold")
o.append(f'<circle cx="88" cy="{LY+62}" r="6" fill="#16A34A" stroke="#16A34A" stroke-width="2"/>'); t(102,LY+67,"Needed for MVP",14)
o.append(f'<circle cx="288" cy="{LY+62}" r="6" fill="#FFF" stroke="#9CA3AF" stroke-width="2"/>'); t(302,LY+67,"Post-MVP",14,"#4B5563")
for i,(p,n,c) in enumerate([("M","Must have","#B91C1C"),("S","Should have","#D97706"),("N","Nice to have","#6B7280")]):
    x=460+i*190; rect(x,LY+47,24,20,"#FFF",c,rx=4,sw=1.5); t(x+12,LY+62,p,12,c,"bold","middle"); t(x+34,LY+63,n,14)
line(1060,LY+58,1130,LY+58); t(1140,LY+63,"Primary handoff",14)
line(1300,LY+58,1370,LY+58,"#B91C1C","7 5"); t(1380,LY+63,"Return / feedback loop",14)
line(1590,LY+58,1660,LY+58,"#334155","5 4",both=True); t(1670,LY+63,"Read / write to SIC",14)
line(1860,LY+58,1930,LY+58,"#15803D","5 4"); t(1940,LY+63,"Evidence to OI",14)
rect(2100,LY+47,60,22,"#F9FAFB","#6B7280",rx=4,dash="6 4",sw=1.5); t(2172,LY+63,"TBD module (no requirement doc)",14)
t(80,LY+100,"Numbers 1 to 4 show the typical order of a manuscript; activities may be combined, reordered or skipped by journal configuration (TR v4 §E). Use-case labels match the 'Use Case Title' rows in Editorial_Strategy_Use_Cases.xlsx.",13,"#6B7280")
o.append('</svg>')
open("/mnt/project-files/editorial-strategy/Editorial_Strategy_Functional_Workflow.svg","w").write("\n".join(o))
