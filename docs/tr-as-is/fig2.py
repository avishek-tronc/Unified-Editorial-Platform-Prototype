import html,textwrap
N='#1730A3'; L='#DDE7F7'; LB='#EEF3FB'; O='#E67E22'; G='#5B6B8C'
W,H=1600,940
s=[]
def t(x,y,txt,size=14,w=400,fill='#1B2540',anchor='start'):
    s.append(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{w}" fill="{fill}" text-anchor="{anchor}">{html.escape(txt)}</text>')
def r(x,y,w,h,fill,stroke='none',rx=8,extra=''):
    s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" {extra}/>')
t(30,44,'Triage and Routing: AS-IS persona view (who does what)',26,700,N)
t(30,70,'Seven roles share the flow; the vendor team, Manuscript Admin and the Author carry most of the manual work before peer review',15,400,G)
cols=['Submit','Screen','Validate','Admin check','Peer review','Decision and handoff']
LX=30; LW=230; CX=LX+LW+10; CW=200; GAP=8; RX=CX+6*(CW+GAP)+6
for i,c in enumerate(cols):
    r(CX+i*(CW+GAP),90,CW,34,N,'none',6); t(CX+i*(CW+GAP)+CW/2,112,c,14,700,'#fff','middle')
r(RX,90,1570-RX,34,'#E8ECF5','none',6); t(RX+(1570-RX)/2,112,'Manual',12,700,N,'middle')
lanes=[
 ('Author','Submits; fixes and revises',{0:('M','Uploads manuscript in Publishing Center'),2:('M','Answers outreach on RRS / AAM language'),3:('M','Corrects missing items, or is unsubmitted'),5:('M','Revises or resubmits after the decision')}),
 ('Systems','Publishing Center, Paragon Plus, ServiceNow, DOTS',{0:('S','Publishing Center extracts metadata; Paragon Plus opens record'),1:('S','Paragon Plus runs OFAC and RRS / funder checks; flags hits'),2:('S','ServiceNow ticket raised for each hit'),3:('S','ServiceNow first task: Admin Check or Assign EE'),4:('S','iThenticate, Fundref and data checks'),5:('S','Accepted manuscript handed to DOTS')}),
 ('Vendor team','Ticket and admin-check desk',{2:('M','Validates ticket: false positive, outreach or escalate'),3:('M','Performs the manuscript admin checks'),4:('M','Re-runs iThenticate; checks funding data on revisions')}),
 ('Portfolio Services and ACS Legal','Escalations and sanctions lists',{1:('R','Legal maintains SDN, inclusion and exclusion lists'),2:('M','Triage new or existing use case; clear or reject')}),
 ('Open Access and Sales Ops','Funder and AAM reference data',{1:('R','Maintains technical sheet: federal funders, AAM language')}),
 ('Manuscript Admin and Editorial Support','Completeness and profile checks',{3:('M','Checks submission; holds and contacts author if items are missing'),4:('M','Profile validation: author lists, ORCID, emails, reviewer badges'),5:('M','Full Check on revised manuscripts')}),
 ('Editors (EE / AE)','Scientific and editorial decision',{4:('M','Run peer review'),5:('M','Decide: accept, revise, reject or transfer')}),
]
Y=134; LH=96
for k,(name,sub,cells) in enumerate(lanes):
    y=Y+k*(LH+8)
    r(LX,y,1540,LH,'#F7F9FD' if k%2==0 else '#fff','#E1E7F2',8)
    nl=textwrap.wrap(name,24)
    for j,ln in enumerate(nl): t(LX+14,y+30+j*18,ln,15,700,N)
    for j,ln in enumerate(textwrap.wrap(sub,30)): t(LX+14,y+30+len(nl)*18+j*16,ln,12,400,G)
    man=0
    for c,(kind,txt) in cells.items():
        x=CX+c*(CW+GAP); bx,by,bw,bh=x+6,y+10,CW-12,LH-20
        if kind=='S': r(bx,by,bw,bh,N); fc='#fff'
        elif kind=='M': r(bx,by,bw,bh,L,'#9FB4E8',8,'stroke-width="1"'); fc='#1B2540'; man+=1
        else: r(bx,by,bw,bh,'#fff',N,8,'stroke-width="1.5" stroke-dasharray="5 4"'); fc=N
        lines=textwrap.wrap(txt,27)
        y0=by+bh/2-(len(lines)-1)*8+5
        for j,ln in enumerate(lines): t(bx+bw/2,y0+j*16,ln,12.5,500,fc,'middle')
    s.append(f'<circle cx="{RX+(1570-RX)/2}" cy="{y+LH/2}" r="20" fill="{O if man>=3 else ("#F5C48F" if man else "#E8ECF5")}"/>')
    t(RX+(1570-RX)/2,y+LH/2+6,str(man),17,700,'#fff' if man>=3 else N,'middle')
ly=Y+7*(LH+8)+14
r(30,ly,24,16,N,'none',3); t(62,ly+13,'System step',14)
r(190,ly,24,16,L,'#9FB4E8',3); t(222,ly+13,'Manual step',14)
r(350,ly,24,16,'#fff',N,3,'stroke-dasharray="4 3"'); t(382,ly+13,'Reference data',14)
s.append(f'<circle cx="540" cy="{ly+8}" r="9" fill="{O}"/>'); t(556,ly+13,'Manual steps per role (3 or more highlighted)',14)
t(1570,ly+13,'Source: Manuscript Flow Publishing TO-BE v1.1, slide "Who Does What" (GEO workflow board in Miro, main flow)',12.5,400,G,'end')
svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{ly+40}" viewBox="0 0 {W} {ly+40}" font-family="Inter"><rect width="{W}" height="{ly+40}" fill="#fff"/>'+''.join(s)+'</svg>'
open('AS2.svg','w').write(svg)
