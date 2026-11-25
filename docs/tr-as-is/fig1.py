import html
N='#1730A3'; L='#DDE7F7'; LB='#EEF3FB'; R='#C0392B'; RL='#FBE9E7'; O='#E67E22'; G='#5B6B8C'
W,H=1600,900
s=[]
def t(x,y,txt,size=14,w=400,fill='#1B2540',anchor='start',style=''):
    s.append(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{w}" fill="{fill}" text-anchor="{anchor}" {style}>{html.escape(txt)}</text>')
def r(x,y,w,h,fill,stroke='none',rx=10,extra=''):
    s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" {extra}/>')
def line(pts,color=N,dash='',arrow=True,w=2):
    d='M'+' L'.join(f'{a},{b}' for a,b in pts)
    s.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" {"stroke-dasharray=%s"%chr(34)+dash+chr(34) if dash else ""} {"marker-end=%surl(#a%s)%s"%(chr(34),color[1:],chr(34)) if arrow else ""}/>')
def diamond(cx,cy,lab,sz=20):
    s.append(f'<polygon points="{cx},{cy-sz} {cx+sz},{cy} {cx},{cy+sz} {cx-sz},{cy}" fill="#fff" stroke="{N}" stroke-width="2.5"/>')
    t(cx,cy+5,lab,12,700,N,'middle')
X=lambda i:30+i*264
BW=220
t(30,44,'Triage and Routing: AS-IS functional flow (upload to operations)',26,700,N)
t(30,70,'Six stages across four systems, two compliance gates before peer review, and four points where a manuscript leaves the flow or loops back',15,400,G)
# system bands
bands=[(0,0,'ACS Publishing Center'),(1,1,'ACS Paragon Plus'),(2,3,'ServiceNow'),(4,4,'ACS Paragon Plus'),(5,5,'DOTS')]
for a,b,name in bands:
    x=X(a); w=X(b)+BW-x
    r(x,88,w,30,LB,N,6,'stroke-width="1" stroke-dasharray="4 3"')
    t(x+w/2,108,'System: '+name,13,600,N,'middle')
stages=[
 ('Upload',[('S','Author uploads the manuscript'),('S','Metadata extracted'),('S','Record passes to Paragon Plus')],'Author'),
 ('Compliance checks',[('S','OFAC check vs SDN, inclusion and exclusion lists'),('S','Rights retention (RRS / AAM) and federal funder check'),('S','Hits flagged on the manuscript')],'System · Legal and OA lists'),
 ('Ticket validation',[('S','ServiceNow ticket raised per hit'),('M','Vendor validates: false positive, outreach or escalate'),('M','Portfolio Services and Legal clear or reject')],'Vendor · Portfolio Svcs · Legal'),
 ('Admin check',[('M','First task: Admin Check or Assign EE'),('M','Vendor and Manuscript Admin run admin checks'),('M','Missing items put on hold; author contacted')],'Vendor · Manuscript Admin · Author'),
 ('Peer review',[('M','Editors run review with Editorial Support'),('S','iThenticate, Fundref, profile and data checks'),('M','Decision: accept, revise, reject or transfer')],'Editors · Editorial Support'),
 ('To operations',[('S','Accepted manuscript handed to DOTS'),('S','Operations takes over')],'Operations'),
]
import textwrap
BY,BH=150,300
for i,(name,items,who) in enumerate(stages):
    x=X(i); last=i==5
    r(x,BY,BW,BH,N if last else L,'none',12)
    fc='#fff' if last else N
    s.append(f'<circle cx="{x+26}" cy="{BY+30}" r="15" fill="{"#fff" if last else N}"/>')
    t(x+26,BY+35,str(i+1),15,700,N if last else '#fff','middle')
    t(x+50,BY+36,name,16 if last else 17,700,fc)
    yy=BY+72
    for kind,txt in items:
        col=(N if kind=='S' else O)
        if last: col='#9FB4E8'
        s.append(f'<circle cx="{x+20}" cy="{yy-5}" r="5" fill="{col}"/>')
        for k,ln in enumerate(textwrap.wrap(txt,24)):
            t(x+34,yy+k*19,ln,14,400,'#fff' if last else '#1B2540')
        yy+=19*len(textwrap.wrap(txt,24))+12
    # who
    r(x+10,BY+BH-52,BW-20,42,'#fff' if not last else '#2B45B8','none',8)
    for k,ln in enumerate(textwrap.wrap(who,30)):
        t(x+BW/2,BY+BH-27+k*15-(7 if len(textwrap.wrap(who,30))>1 else 0),ln,12,600,G if not last else '#fff','middle')
# main arrows
for i in range(5):
    x1=X(i)+BW; x2=X(i+1)
    line([(x1,BY+150),(x2-2,BY+150)])
diamond(X(1)+BW+22,BY+150,'G1')   # hit?
diamond(X(3)+BW+22,BY+150,'G2')
diamond(X(4)+BW+22,BY+150,'G3')
# bypass: no hit
line([(X(1)+BW/2,BY),(X(1)+BW/2,132),(X(3)+BW/2,132),(X(3)+BW/2,BY-2)])
r(X(2)+-10,121,240,22,'#fff','none',4)
t(X(2)+BW/2,137,'G1 no hit: straight to Admin Check',12,600,N,'middle')
t(X(1)+BW+22,BY+190,'hit',12,600,N,'middle')
# exits
EY=520; EH=70
def exitbox(x,w,title,sub,color=R,fill=RL,dash=False):
    r(x,EY,w,EH,fill,color,8,'stroke-width="1.5"'+(' stroke-dasharray="6 4"' if dash else ''))
    t(x+14,EY+28,title,15,700,color)
    t(x+14,EY+50,sub,12.5,400,'#3A4560')
exitbox(X(2)-5,230,'Rejected by Legal','OFAC match confirmed; not cleared')
line([(X(2)+BW/2,BY+BH),(X(2)+BW/2,EY-2)],R)
exitbox(X(3)-5,230,'Unsubmitted','Missing items not corrected')
line([(X(3)+BW/2,BY+BH),(X(3)+BW/2,EY-2)],R)
exitbox(X(4)+45,240,'Rejected or transferred','Editor decision at G3')
line([(X(4)+150,BY+BH),(X(4)+150,EY-2)],R)
# revision loop
line([(X(4)+30,BY+BH),(X(4)+30,640),(X(1)+BW/2,640),(X(1)+BW/2,BY+BH+2)],N,'7 5')
r(X(2)-20,626,520,28,'#fff',N,6,'stroke-dasharray="6 4"')
t(X(2)+240,645,'Revision or reject-and-resubmit: Full Check, then re-enters the flow',13,600,N,'middle')
# hold loop at admin check
t(X(3)+BW/2,BY+BH+60,'',1)
# legend / gates
LY=700
r(30,LY,1540,170,'#F7F9FD','#D5DEEE',10)
t(54,LY+34,'Decision gates',16,700,N)
gates=[('G1','Compliance hit? OFAC list match, or RRS / AAM language or top federal funder'),('G2','Initial (admin) check passed? If not: on hold, author outreach, else unsubmitted'),('G3','Editor decision: accept, revise, reject or transfer')]
for k,(g,txt) in enumerate(gates):
    diamond(70,LY+66+k*36,g,15)
    t(96,LY+71+k*36,txt,14,400,'#1B2540')
t(860,LY+34,'Legend',16,700,N)
s.append(f'<circle cx="870" cy="{LY+62}" r="6" fill="{N}"/>'); t(884,LY+67,'System step',14)
s.append(f'<circle cx="1010" cy="{LY+62}" r="6" fill="{O}"/>'); t(1024,LY+67,'Manual step (person)',14)
r(862,LY+86,26,16,RL,R,3); t(898,LY+99,'Leaves the flow',14)
line([(1030,LY+94),(1080,LY+94)],N,'7 5'); t(1090,LY+99,'Loop back into the flow',14)
t(862,LY+136,'Manual work concentrates in stages 3 to 5; four systems each hold part of the status.',14,600,O)
t(862,LY+158,'Source: Manuscript Flow Publishing TO-BE v1.1, AS-IS slides (GEO workflow board, main flow).',12.5,400,G)
mk=''.join(f'<marker id="a{c[1:]}" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>' for c in [N,R])
svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Inter"><defs>{mk}</defs><rect width="{W}" height="{H}" fill="#fff"/>'+''.join(s)+'</svg>'
open('AS1.svg','w').write(svg)
