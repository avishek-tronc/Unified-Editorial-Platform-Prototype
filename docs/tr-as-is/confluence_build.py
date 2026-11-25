from html import escape as e
def st(title,colour,subtle=False):
    return f'<ac:structured-macro ac:name="status" ac:schema-version="1"><ac:parameter ac:name="colour">{colour}</ac:parameter><ac:parameter ac:name="title">{title}</ac:parameter>{"<ac:parameter ac:name=\"subtle\">true</ac:parameter>" if subtle else ""}</ac:structured-macro>'
SYS=st('System','Blue'); MAN=st('Manual','Yellow'); DEC=st('Decision','Purple'); EXIT=st('Exit','Red'); REF=st('Reference data','Grey')
def th(cells): return '<tr>'+''.join(f'<th data-highlight-colour="#1730a3"><p><strong><span style="color: rgb(255,255,255);">{e(c)}</span></strong></p></th>' for c in cells)+'</tr>'
def td(cells,band=False):
    return '<tr>'+''.join(f'<td{" data-highlight-colour=\"#eef3fb\"" if band else ""}>{c if c.startswith("<") else "<p>"+e(c)+"</p>"}</td>' for c in cells)+'</tr>'
def table(head,rows): return '<table data-layout="full-width"><tbody>'+th(head)+''.join(td(r,i%2==1) for i,r in enumerate(rows))+'</tbody></table>'
def img(n,cap): return f'<ac:image ac:align="center" ac:layout="center" ac:width="1600"><ri:attachment ri:filename="{n}"/></ac:image><p style="text-align: center;"><em>{e(cap)}</em></p>'
def ul(items): return '<ul>'+''.join(f'<li><p>{i}</p></li>' for i in items)+'</ul>'
def panel(kind,html): return f'<ac:structured-macro ac:name="{kind}" ac:schema-version="1"><ac:rich-text-body>{html}</ac:rich-text-body></ac:structured-macro>'
def br(lines): return '<p>'+'<br/>'.join(e(l) for l in lines)+'</p>'
B=[]
B.append(panel('info','<p><strong>Scope:</strong> the AS-IS manuscript flow from upload in ACS Publishing Center to handoff to DOTS, as it bears on Triage and Routing. <strong>Source:</strong> <em>Manuscript_Flow_Publishing_TO_BE v1.1</em> (AS-IS slides: End to End, Who Does What, Sequence of Activities; Gaps; Proposed TO-BE), which reads the GEO workflow board in Miro (main flow). Updated 25 Nov 2026.</p>'))
B.append('<ac:structured-macro ac:name="toc" ac:schema-version="1"><ac:parameter ac:name="maxLevel">2</ac:parameter></ac:structured-macro>')
# 1
B.append('<h1>1. High-level functional process flow</h1>')
B.append('<p>Six stages across four systems take a manuscript from upload to operations. Two compliance gates run before peer review, and a manuscript can leave the flow or loop back at four points.</p>')
B.append(img('TR-AS-IS-Figure1.png','Figure AS-1: AS-IS functional flow, upload to operations (schematic)'))
B.append(ul([
 '<strong>Systems:</strong> ACS Publishing Center (upload), ACS Paragon Plus (compliance checks, peer review), ServiceNow (ticket validation, admin check) and DOTS (operations). Each holds part of the manuscript status.',
 '<strong>Compliance gate (G1):</strong> Paragon Plus checks OFAC lists (SDN, inclusion, exclusion) and rights retention / AAM language and top federal funders. A hit raises a ServiceNow ticket; no hit goes straight to the admin check.',
 '<strong>Admin gate (G2):</strong> the first ServiceNow task is Admin Check or Assign EE. Missing items put the manuscript on hold while the author is contacted; if they are not corrected, it is unsubmitted.',
 '<strong>Editor decision (G3):</strong> after peer review the editor accepts, asks for revision, rejects or transfers. Accepted manuscripts go to DOTS.',
 '<strong>Exits and loops:</strong> rejected by Legal (confirmed OFAC match), unsubmitted (missing items), rejected or transferred (editor decision), and revision or reject-and-resubmit, which takes a Full Check and re-enters the flow.',
]))
# 2
B.append('<h1>2. Sequence of operations</h1>')
B.append('<p>The table follows the main path step by step, with the decision points and exits from the AS-IS sequence of activities.</p>')
rows=[
 ['1','Upload','Author uploads the manuscript','Author','Publishing Center',MAN,'Manuscript submitted'],
 ['2','Upload','Metadata extracted; record opened in Paragon Plus','System','Publishing Center, Paragon Plus',SYS,'Record in Paragon Plus'],
 ['3','Compliance checks','OFAC check against SDN, inclusion and exclusion lists (lists kept by Legal)','System','Paragon Plus',SYS,'Hit flagged, or no hit'],
 ['4','Compliance checks','Rights retention (RRS / AAM language) and top federal funder check (technical sheet kept by Open Access and Sales Ops)','System','Paragon Plus',SYS,'Hit flagged, or no hit'],
 ['G1','Compliance checks','OFAC list match? RRS / AAM or top federal funder?','System','Paragon Plus',DEC,'No hit: go to step 8. Hit: go to step 5 or 6'],
 ['5','Ticket validation','OFAC hit: ServiceNow ticket; vendor validates; Portfolio Services and Legal review escalations','Vendor, Portfolio Services, ACS Legal','ServiceNow',MAN,'Cleared or false positive: step 8. Not cleared: step 7'],
 ['6','Ticket validation','RRS / funder hit: ServiceNow ticket; vendor validates and contacts the author; adds an R flag or note for the EO','Vendor, Author','ServiceNow',MAN,'Flag or note on the manuscript; step 8'],
 ['7','Exit','Rejected with language from Legal','ACS Legal','ServiceNow',EXIT,'End of flow'],
 ['8','Admin check','First task in ServiceNow: Admin Check or Assign EE','Vendor, Manuscript Admin','ServiceNow',MAN,'Task assigned'],
 ['9','Admin check','Manuscript admin checks: completeness of the submission','Vendor, Manuscript Admin','ServiceNow',MAN,'Passed or items missing'],
 ['G2','Admin check','Initial check passed?','Manuscript Admin','ServiceNow',DEC,'Yes: step 11. No: step 10'],
 ['10','Admin check','On hold: outreach to the author; corrected items return to Admin Check. Not corrected: unsubmitted','Manuscript Admin, Author','ServiceNow',MAN,'Back to step 9, or exit (unsubmitted)'],
 ['11','Peer review','Profile validation: author lists, ORCID, emails, reviewer badges','Editorial Support','Paragon Plus',MAN,'Profiles validated'],
 ['12','Peer review','iThenticate, Fundref and data checks (vendor re-runs iThenticate and funding data on revisions)','System, Vendor','Paragon Plus',SYS,'Check results for the editor'],
 ['13','Peer review','Editors run peer review','Editors, Reviewers','Paragon Plus',MAN,'Reviews returned'],
 ['G3','Decision','Editor decision: accept, revise, reject or transfer','Editors','Paragon Plus',DEC,'Accept: step 14. Revise or reject-and-resubmit: step 15. Reject: end. Transfer: another journal'],
 ['14','To operations','Accepted manuscript handed to DOTS; Operations takes over','System, Operations','DOTS',SYS,'In production'],
 ['15','Revision','Full Check on the revised manuscript, then it re-enters the flow','Manuscript Admin, Author','Paragon Plus',MAN,'Re-enters at the checks'],
]
B.append(table(['Step','Stage','Operation','Performed by','System','Type','Output / next step'],rows))
# 3
B.append('<h1>3. Persona-specific view</h1>')
B.append('<p>Seven roles share the flow. The vendor team, Manuscript Admin and the Author carry most of the manual work before peer review starts.</p>')
B.append(img('TR-AS-IS-Figure2.png','Figure AS-2: AS-IS persona view, who does what at each stage'))
prow=[
 ['<p><strong>Author</strong></p>','Submit; Validate; Admin check; Decision','Uploads the manuscript; answers outreach on RRS / AAM language; corrects missing items; revises or resubmits after the decision','Publishing Center, email outreach','Learns about problems late, one request at a time, after editors or vendors have already spent time on the manuscript; can be unsubmitted for missing items'],
 ['<p><strong>Vendor team</strong></p>','Validate; Admin check; Peer review','Validates every ServiceNow ticket (false positive, outreach or escalation); performs the admin checks; re-runs iThenticate and funding checks on revisions','ServiceNow, Paragon Plus','Works one ticket per hit, false positives included; repeats checks on every revision'],
 ['<p><strong>Portfolio Services and ACS Legal</strong></p>','Screen; Validate','Legal maintains the SDN, inclusion and exclusion lists; triages new or existing use cases; clears or rejects escalations','ServiceNow, reference lists','Escalations arrive as tickets without the full manuscript context; list upkeep is manual'],
 ['<p><strong>Open Access and Sales Ops</strong></p>','Screen','Maintains the technical sheet of federal funders and AAM language used by the funder check','Technical sheet','Reference data sits outside the workflow; a stale sheet means missed or false hits'],
 ['<p><strong>Manuscript Admin and Editorial Support</strong></p>','Admin check; Peer review; Decision','Checks the submission; holds it and contacts the author if items are missing; validates author lists, ORCID, emails and reviewer badges; runs the Full Check on revisions','ServiceNow, Paragon Plus','Manual completeness and profile checks; status and flags spread across ServiceNow and Paragon Plus'],
 ['<p><strong>Editors (EE / AE)</strong></p>','Admin check (Assign EE); Peer review; Decision','Executive Editor is assigned as a manual first task; editors run peer review and decide accept, revise, reject or transfer','Paragon Plus','Assignment leans on raw open-assignment counts and context spread over screens; integrity and funder checks land during review; transfer has no defined destination'],
 ['<p><strong>Systems</strong> (Publishing Center, Paragon Plus, ServiceNow, DOTS)</p>','All stages','Extract metadata, run OFAC and RRS / funder checks, raise tickets, create the first task, run iThenticate / Fundref / data checks, hand off to DOTS','—','Four systems, no single record or status; flags sit outside the ticket'],
]
B.append(table(['Persona','Stages involved','What they do today','Systems used','Pain points'],prow))
# 4
B.append('<h1>4. Gaps and concerns in the current flow</h1>')
B.append('<h2>4.a Gaps</h2>')
B.append('<p>Seven gaps slow the manuscript before peer review starts. Gaps 1 to 5 come from the AS-IS slides; gaps 6 and 7 also draw on the Triage and Routing future-state product definition.</p>')
H=st('High','Red'); M=st('Medium','Yellow')
grows=[
 ['1','Quality and integrity checks run late','iThenticate, Fundref, profile and data checks run during peer review, after editors are already engaged','Error rate, efficiency, lead time',H,'1 Upfront validation'],
 ['2','Completeness is checked by hand','Manuscript Admin and vendor teams run the admin check; missing items go on hold while the author is contacted','Efficiency, throughput, cycle time',H,'1 Upfront validation'],
 ['3','Every compliance hit becomes a ticket','Each OFAC or RRS / funder hit raises a ServiceNow ticket that a vendor validates, false positives included','Hand-offs, throughput, lead time',H,'2 Automated acceptance'],
 ['4','Work is split across four systems','Publishing Center, Paragon Plus, ServiceNow and DOTS each hold part of the status; flags sit outside the ticket','Single system and flow, error rate',M,'2 Automated acceptance'],
 ['5','Too many hand-offs before review','Seven roles touch a manuscript; a flagged one can pass vendor, Portfolio Services, Legal and Manuscript Admin','Hand-offs, lead time',H,'2 Automated acceptance'],
 ['6','Editor assignment is manual','Assign EE is a manual first task; the choice leans on raw open-assignment counts and context spread over screens','Efficiency, throughput, error rate',H,'3 Triage and routing'],
 ['7','Wrong routes and transfers are hard to fix','Transfer has no defined destination in the flow; a wrong assignment is undone by unsubmission or a workaround','Error rate, cycle time',M,'3 Triage and routing'],
]
B.append(table(['#','Gap','What happens today','Objectives affected','Impact','Closed by'],grows))
B.append('<p><em>Impact ratings are a first assessment for discussion, not from the deck.</em></p>')
B.append('<h2>4.b Concerns</h2>')
B.append('<p>Further concerns read from the AS-IS flow, to confirm with the business owners:</p>')
B.append(ul([
 '<strong>No baseline.</strong> Volumes, touch counts, false-positive rates and stage times are not measured end to end, so improvement targets cannot be set yet.',
 '<strong>Revisions repeat the work.</strong> A revised or resubmitted manuscript takes a Full Check and the vendor re-runs iThenticate and funding checks, so the same effort is spent again.',
 '<strong>Reference data is maintained by hand.</strong> The SDN, inclusion and exclusion lists and the funder / AAM technical sheet sit outside the workflow; the checks are only as current as these lists.',
 '<strong>Fragmented audit trail.</strong> Outcomes, flags and notes for the EO are split between Paragon Plus and ServiceNow tickets, which makes compliance reporting and root-cause analysis harder.',
 '<strong>Dependence on the vendor queue.</strong> Throughput before peer review is bounded by vendor capacity on tickets and admin checks.',
 '<strong>Author experience.</strong> Problems reach the author late and one at a time, through outreach, rather than as one itemised report at upload.',
]))
# 5
B.append('<h1>5. Potential scope of improvement in the TO-BE flow</h1>')
B.append('<p>The proposed TO-BE flow validates once and routes automatically: checks move to the point of upload, the ticket queue is removed for routine cases, and editors are selected by rules in one flow from Publishing Center to DOTS.</p>')
B.append(img('TR-AS-IS-Figure3.png','Figure AS-3: AS-IS gaps mapped to the three proposed automation measures'))
B.append('<h2>5.a Automation measures</h2>')
mrows=[
 ['<p><strong>1 Upfront validation</strong></p><p>Replaces late checks and the manual admin check</p>',ul(['Rules engine with generic rules plus journal-specific rules','Checks plagiarism, integrity, figures, graphs, equations and completeness','Integrity score against a pass threshold set per journal','Failures go back to the author at once with an itemised report']),'1, 2',ul(['First-pass validation rate','Items returned to authors','Defects found after assignment'])],
 ['<p><strong>2 Automated acceptance</strong></p><p>Replaces the ServiceNow ticket and vendor validation</p>',ul(['Validation result drives an Accepted or Rejected outcome','Outcome and reasons recorded on the manuscript, not in a ticket','Only exceptions reach a person, such as a confirmed OFAC match to Legal','Accepted manuscripts pass straight to triage and routing']),'3, 4, 5',ul(['Tickets and vendor touches per manuscript','Upload-to-triage time','False positives overturned'])],
 ['<p><strong>3 Triage and routing</strong></p><p>Replaces manual Assign EE and ad hoc transfer</p>',ul(['Prioritized queue with decision-ready manuscript context','Auto-selection of Associate Editor and Executive Editor by expertise, capacity and conflict rules','Assignment mode per journal: manual, recommended or automatic','Decision support for Accept, Reject, Transfer and Revise, with alternate-journal suggestions']),'6, 7',ul(['Time to editor assignment','Reassignment and override rate','Submission-to-first-decision time'])],
]
B.append(table(['Measure','Automation mechanisms','Gaps closed','How to measure it'],mrows))
B.append('<h2>5.b What changes from the AS-IS flow</h2>')
B.append(table(['Area','AS-IS','TO-BE (proposed)'],[
 ['Checks','iThenticate, Fundref, profile and data checks during peer review','Run once, at upload, against generic and journal rules'],
 ['Compliance hits','A ServiceNow ticket per hit, validated by a vendor','Automated Accepted or Rejected outcome; ServiceNow and the vendor queue handle exceptions only'],
 ['Completeness','Manual admin check; hold and author outreach loop','Completeness rules at upload; failures returned with an itemised report'],
 ['Editor assignment','Manual Assign EE first task','Rules select AE and EE by expertise, stage-aware capacity, conflicts and journal rules'],
 ['Transfer','No defined destination; workarounds','System proposes one of 3 to 5 mapped journals, or the Author selects one; the Publishing Editor approves or reassigns; context travels with the manuscript'],
 ['Record and status','Split across four systems','One record and one status: score, outcome, assignment and audit trail on the manuscript'],
 ['Revisions','Full Check and repeated vendor checks','Revised manuscript re-enters at validation'],
]))
B.append('<h2>5.c TO-BE use case from the 11-17 workshop</h2>')
B.append(ul([
 'The Author uploads the manuscript; the platform checks generic and journal-specific rules and generates an integrity score of 1 to 10.',
 'Score 1 to 5: rejected and returned to the author. Score 6 to 10: passes and is assigned to the Executive Editor with status "Pending Approval".',
 'The EE approves the score and assigns the manuscript for peer review; the reviewer returns Accept, Reject, Revise (minor or major) or Transfer.',
 'Transfer is system driven (proposed from the journal\'s 3 to 5 mapped journals; the author accepts, or the PE assigns) or author driven (the PE approves or assigns another journal).',
 'Open points: what happens if the EE does not approve the score; whether the author must consent to a journal the PE assigns.',
]))
B.append(panel('note','<p><strong>Guardrails.</strong> The TO-BE flow is proposed for discussion. An authorized Editor still makes the scientific and editorial decision. AI on manuscript content needs security, legal and privacy approval before any pilot.</p><p><strong>Next steps:</strong> baseline current volumes, touch counts and stage times; set a target for each measure; pick pilot journals.</p>'))
open('body.xml','w').write(''.join(B))
print(len(''.join(B)))
