import html,textwrap
N='#1730A3'; L='#DDE7F7'; R='#C0392B'; RL='#FBE9E7'; GR='#1E7B4F'; GL='#E3F4EA'; G='#5B6B8C'
W=1600
s=[]
def t(x,y,txt,size=14,w=400,fill='#1B2540',anchor='middle'):
    s.append(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{w}" fill="{fill}" text-anchor="{anchor}">{html.escape(txt)}</text>')
def r(x,y,w,h,fill,stroke='none',rx=8,extra=''):
    s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" {extra}/>')
def line(pts,color=N,dash=''):
    d='M'+' L'.join(f'{a},{b}' for a,b in pts)
    s.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="2" {("stroke-dasharray=%s" % chr(34)+dash+chr(34)) if dash else ""} marker-end="url(#a{color[1:]})"/>')
def box(x,y,w,h,title,sub,fill,fc,stroke='none'):
    r(x,y,w,h,fill,stroke,10,'stroke-width="1.5"')
    t(x+w/2,y+30,title,16,700,fc)
    for j,ln in enumerate(textwrap.wrap(sub,26)): t(x+w/2,y+52+j*17,ln,12.5,400,fc if fc!='#fff' else '#DDE7F7')
t(30,44,'From AS-IS to the proposed TO-BE: where the gaps close',26,700,N,'start')
t(30,70,'Seven AS-IS gaps map to three automation measures; checks move to upload, the ticket queue goes, and editors are selected by rules',15,400,G,'start')
# AS-IS row
t(30,112,'AS-IS',15,700,R,'start')
asis=[('Upload','Publishing Center'),('Compliance checks','Paragon Plus'),('Ticket validation','ServiceNow, vendor'),('Admin check','ServiceNow, vendor, Manuscript Admin'),('Peer review','Paragon Plus; late checks'),('Operations','DOTS')]
BW=230; X=lambda i:30+i*258
for i,(a,b) in enumerate(asis):
    hot=i in (2,3)
    box(X(i),124,BW,96,a,b,RL if hot else L,R if hot else N,R if hot else 'none')
    if i<5: line([(X(i)+BW,172),(X(i+1)-2,172)],G)
# gaps chips
gaps={1:[3,4],2:[5],3:[1,2],4:[0,0]}
gapmap=[(4,1,'Quality checks run late'),(3,2,'Manual completeness check'),(2,3,'Every hit becomes a ticket'),(None,4,'Status split over 4 systems'),(None,5,'Too many hand-offs'),(3,6,'Manual Assign EE'),(4,7,'Transfers hard to fix')]
GY=250
t(30,GY+4,'Gaps',15,700,R,'start')
chipx=[95+i*212 for i in range(7)]
for k,(st,n,txt) in enumerate(gapmap):
    x=chipx[k]
    r(x,GY-16,202,30,'#fff',R,15,'stroke-width="1.5"')
    s.append(f'<circle cx="{x+16}" cy="{GY-1}" r="11" fill="{R}"/>'); t(x+16,GY+4,str(n),12,700,'#fff')
    t(x+110,GY+4,txt,12.5,600,R)
# measures
MY=318
meas=[('1  Upfront validation','Generic and journal rules at upload; integrity score; failures back to the author',[1,2]),
      ('2  Automated acceptance','Accepted or Rejected outcome on the record; exceptions only to people',[3,4,5]),
      ('3  Triage and routing','Rules select AE and EE by expertise, capacity, conflicts; decision and transfer support',[6,7])]
MW=480
for k,(a,b,gs) in enumerate(meas):
    x=30+k*(MW+50)
    r(x,MY,MW,92,GL,GR,10,'stroke-width="1.5"')
    t(x+MW/2,MY+30,a,17,700,GR)
    for j,ln in enumerate(textwrap.wrap(b,62)): t(x+MW/2,MY+54+j*17,ln,13,400,'#1B2540')
    for g in gs:
        cx=chipx[g-1]+101
        line([(cx,GY+14),(cx,GY+34),(x+MW/2,GY+34),(x+MW/2,MY-2)],GR)
# TO-BE row
TY=460
t(30,TY-8,'TO-BE (proposed)',15,700,GR,'start')
tobe=[('Upload','Publishing Center; metadata extracted',L,N),('Upfront validation','Integrity score vs journal threshold',GL,GR),('Automated acceptance','No ticket, no vendor step',GL,GR),('Triage and routing','Auto-selects AE and EE',GL,GR),('Peer review','Checks already complete',L,N),('Editor decision','Accept, revise, reject, transfer',L,N)]
for i,(a,b,f,c) in enumerate(tobe):
    box(X(i),TY,BW,96,a,b,f,c,c if f==GL else 'none')
    if i<5: line([(X(i)+BW,TY+48),(X(i+1)-2,TY+48)],GR)
for k in range(3):
    x=30+k*(MW+50)+MW/2
    line([(x,MY+92),(x,TY-14)],GR,'5 4') if False else None
t(800,TY+132,'One record and one status from Publishing Center to DOTS; an authorized Editor still makes the scientific and editorial decision.',14,600,N)
H=TY+160
mk=''.join(f'<marker id="a{c[1:]}" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>' for c in [N,R,GR,G])
svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Inter"><defs>{mk}</defs><rect width="{W}" height="{H}" fill="#fff"/>'+''.join(s)+'</svg>'
open('AS3.svg','w').write(svg)
