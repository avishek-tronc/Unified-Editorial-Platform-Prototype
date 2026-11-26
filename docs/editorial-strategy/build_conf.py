import sys,json; sys.path.insert(0,'.')
from usecases import ROWS, MODULES, ORDER
from xml.sax.saxutils import escape as E
def st(title,col,subtle=False):
    return f'<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">{col}</ac:parameter><ac:parameter ac:name="title">{E(title)}</ac:parameter>{"<ac:parameter ac:name=\"subtle\">true</ac:parameter>" if subtle else ""}</ac:structured-macro>'
PC={"Must Have":"Red","Should Have":"Yellow","Nice to Have":"Grey"}
CC={"High":"Red","Medium":"Yellow","Low":"Green"}
MC={"YES":"Green","NO":"Grey"}
hdr=["Sl. No#","Module Name","Use Case Title","Priority","Complexity","Needed for MVP","Dependency","Notes"]
num={id(r):i for i,r in enumerate(ROWS,1)}
out={}
for m in ORDER:
    rs=[r for r in ROWS if r[0]==m]
    if rs[0][3]=="TBD":
        out[m]=(f'<ac:structured-macro ac:name="note"><ac:rich-text-body><p><strong>TBD</strong>: requirement document not available for {E(MODULES[m])}. Use cases, priority, complexity, MVP and dependencies to be defined.</p>'
                f'<p><em>Responsibilities other module docs assign here:</em> {E(rs[0][7].split(": ",1)[1])}</p></ac:rich-text-body></ac:structured-macro>')
        continue
    n=len(rs); mvp=sum(r[5]=="YES" for r in rs)
    h=f'<p><em>{n} use cases, {mvp} needed for MVP. Source: {m} requirements document.</em></p>'
    h+='<table data-layout="full-width"><colgroup><col style="width:60px"/><col style="width:150px"/><col style="width:300px"/><col style="width:110px"/><col style="width:100px"/><col style="width:90px"/><col style="width:200px"/><col style="width:360px"/></colgroup><tbody><tr>'+"".join(f'<th><p><strong>{x}</strong></p></th>' for x in hdr)+'</tr>'
    for r in rs:
        h+=(f'<tr><td><p>{num[id(r)]}</p></td><td><p>{E(MODULES[m])}</p></td><td><p>{E(r[1])}</p></td><td><p>{st(r[3],PC[r[3]])}</p></td>'
            f'<td><p>{st(r[4],CC[r[4]],True)}</p></td><td><p>{st(r[5],MC[r[5]])}</p></td><td><p>{E(r[6])}</p></td><td><p>{E(r[7])}</p></td></tr>')
    out[m]=h+'</tbody></table>'
tail=('<h2>Overall functional workflow (all modules)</h2>'
 '<ac:structured-macro ac:name="info"><ac:rich-text-body><p>Schematic view of every module and its primary use cases, and how they hand off to each other. Contextual Workspaces sit on top as the participant layer; manuscripts flow 1 Guidance &amp; Readiness, 2 Integrity Assurance, 3 Triage &amp; Routing, 4 Reviewer Discovery, then peer review; Workflow Coordination orchestrates; Structured Information &amp; Continuity is the data foundation; Operational Intelligence observes the whole flow. Green dot = needed for MVP, M/S/N = Must/Should/Nice to have.</p></ac:rich-text-body></ac:structured-macro>'
 '<ac:image ac:align="center" ac:layout="full-width" ac:original-width="3200" ac:original-height="1640"><ri:attachment ri:filename="Editorial_Strategy_Functional_Workflow.png"/></ac:image>'
 '<h3>Key relationships</h3><ul>'
 + "".join(f'<li><p>{E(x)}</p></li>' for x in [
  "GR to TR: author intent, acceptable/excluded journals and routing authorisation (GR-REQ-013, TR-REQ-013).",
  "GR to IA to TR: readiness status and the consolidated integrity report feed decision-ready triage context (GR-REQ-017, IA-13, TR-REQ-002).",
  "IA to RD and TR: conflict-of-interest, sanctions and identity results constrain reviewer and editor selection (IA-10, RD-REQ-010, TR-REQ-010).",
  "IA to GR: externally owned determinations shown as readiness impact, never re-adjudicated (GR-REQ-015).",
  "TR to GR: return to the author for a focused readiness fix; TR to TR: transfer or reroute to another ACS journal (GR-REQ-010, TR-REQ-015).",
  "TR to RD to WC: Handling Editor advances the manuscript; RD hands primary and alternate reviewers to Workflow Coordination for invitations (RD-REQ-014).",
  "SIC to all modules: authoritative content, versions, change signals and provenance; change signals trigger GR reassessment and IA re-screening (SIC-REQ-008/012).",
  "All modules to OI: events and evidence; OI returns capacity and workload context to TR and RD (OI-REQ-008, TR-REQ-009, RD-REQ-012)."])
 + '</ul><ac:structured-macro ac:name="note"><ac:rich-text-body><p>Priority, Complexity and MVP ratings are proposals derived from each document\'s MVP section (IA, TR) or from evidence strength and integration effort, and need validation with module owners. Updated 26 Nov 2026.</p></ac:rich-text-body></ac:structured-macro>')
out["_tail"]=tail
json.dump(out,open('conf.json','w'))
print(len(json.dumps(out)))
