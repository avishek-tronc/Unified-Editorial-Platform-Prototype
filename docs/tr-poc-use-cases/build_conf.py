"""Builds the Confluence storage body (head part) for 'TR Use Cases for POC (AI Based)'.
The tail of the page (older use case list and pptx embeds) is kept in the page context."""
import html, os
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
E = lambda s: html.escape(s, quote=False)
HC = '#0f4761'

def th(t):
    return f'<th data-highlight-colour="{HC}"><p><strong><span style="color: rgb(255,255,255);">{E(t)}</span></strong></p></th>'

def table(headers, rows, widths, bold_first=True):
    cg = ''.join(f'<col style="width: {w}px;" />' for w in widths)
    out = f'<table data-table-width="1800" data-layout="center"><colgroup>{cg}</colgroup><tbody><tr>{"".join(th(h) for h in headers)}</tr>'
    for r in rows:
        cells = []
        for i, c in enumerate(r):
            c = E(c)
            cells.append(f'<td><p>{"<strong>"+c+"</strong>" if (i == 0 and bold_first) else c}</p></td>')
        out += '<tr>' + ''.join(cells) + '</tr>'
    return out + '</tbody></table>'

def img(fn, cap):
    w, h = Image.open(os.path.join(D, fn)).size
    return (f'<ac:image ac:align="center" ac:layout="center" ac:original-height="{h}" ac:original-width="{w}" ac:custom-width="true" ac:alt="{fn}" ac:width="1706">'
            f'<ri:attachment ri:filename="{fn}" /></ac:image><p style="text-align: center;"><em>{E(cap)}</em></p>')

SLUG = {1:'MSC-Summary',2:'MSC-Fitment',3:'MSC-Validation-Integrity',4:'MSC-Transfer',5:'Editor-Auto-Assignment',6:'Reviewer-Lookup'}
P = [
 dict(n=1, l='a', t='MSC Summary',
  obj='Generate a structured, source-grounded summary of every manuscript (aims, methods, key findings, novelty claims, topics and entities) for the Editor Triage Workspace, and keep it current across revisions.',
  agent='Summary & Fit agent (manuscript.summarize), sequential runtime',
  sc='At least 85% of summaries rated accurate and useful by Editors on a sample; zero unsupported statements (every statement linked to a manuscript passage); P95 under 60 seconds; revisions regenerate only changed sections.',
  design=[
   ('Trigger and orchestration','ManuscriptParsed → Context & Enrichment (SQS subscriber) → Agent Connector opens a manuscript.summarize run on the sequential runtime.'),
   ('AI components','Summary & Fit agent on AgentCore Runtime; Claude on Bedrock with versioned prompt templates per article type (Bedrock Prompt Management); Bedrock Guardrails contextual grounding check.'),
   ('Processing','Long manuscripts are summarized section by section and then combined; Textract extracts figure and table text, and Comprehend extracts entities and key phrases.'),
   ('Data','Summaries and section fingerprints in DynamoDB with an ElastiCache read cache; source files in S3; topics and entities indexed in OpenSearch.'),
   ('APIs and events','GET /triage/cases/{caseId}/summary; POST …/summary/feedback; publishes SummaryReady, which feeds ContextReady.'),
   ('Design choices','The summary, topics and entities are reused by POC 2 (fitment), POC 4 (transfer), POC 5 (Editor auto-assignment) and POC 6 (Reviewer look-up); prompt caching for shared instructions; only changed sections are regenerated.'),
  ]),
 dict(n=2, l='b', t='MSC fitment for a Journal',
  obj="For the journal a manuscript was submitted to, assess how well it fits that journal's scope and editorial criteria, with related-research evidence, to support the Editor's early decision.",
  agent='Summary & Fit agent (scope.assess), sequential runtime with retrieval',
  sc="Fit assessment agrees with the Editor's early decision (proceed, transfer or decline) in at least 80% of a historical sample; every assessment cites evidence; Editor triage time reduced by at least 30%.",
  design=[
   ('Trigger and orchestration','Opening a case in the Editor Triage Workspace (or ContextReady) → Context & Enrichment requests a scope.assess run on the sequential runtime.'),
   ('AI components','Summary & Fit agent on AgentCore Runtime; Claude on Bedrock for the assessment and explanation; Guardrails for grounding so every claim cites a source.'),
   ('Knowledge',"Knowledge Bases on OpenSearch with the journal's scope and criteria, its recent publications and a related-research index (Crossref metadata)."),
   ('Data','Journal criteria in Aurora PostgreSQL (Workflow & Policy Config); assessments in DynamoDB, cached in ElastiCache per manuscript version.'),
   ('APIs and events','GET /triage/cases/{caseId}/scope-fit; PATCH /triage/cases/{caseId} for the disposition; publishes ScopeAssessed.'),
   ('Design choices','Criteria are per journal, not global, so journals keep their own standards; the manuscript profile from POC 1 (MSC summary) is reused to avoid repeat model calls; a poor fit can start POC 4 (transfer).'),
  ]),
 dict(n=3, l='c', t='MSC validation and Integrity Check',
  obj='Validate every new manuscript, and every revision, on arrival, then screen it against a common set of integrity parameters plus the parameters configured for the target journal, and present explained signals and a score to the Editor.',
  agent='Integrity Check agent (integrity.screen) on the parallel runtime',
  sc='At least 90% agreement with manual validation and integrity checks on a sample of past manuscripts; every finding linked to evidence; P95 under 5 minutes per manuscript; at least 50% fewer model calls on revisions through result reuse.',
  design=[
   ('Trigger and orchestration','ManuscriptParsed event → Integrity Orchestrator → Agent Connector opens an agent run with skill integrity.screen; the Step Functions Parallel state fans out one branch per parameter.'),
   ('Validation','Submission and completeness rules (V-01 to V-16 in the MSC Validation and Integrity Rules catalogue) run in Submission & Parsing before screening; gaps go back to the Author.'),
   ('Parameter configuration','Common and journal-specific integrity parameter sets (I-01 to I-22) stored as versioned configuration in Workflow & Policy Config (Aurora PostgreSQL); each parameter maps to a capability in the capability registry.'),
   ('AI components','Integrity Check agent on AgentCore Runtime; Claude on Bedrock for policy and statement checks grounded in a Knowledge Base of journal guidelines; Bedrock Guardrails for PII and grounding.'),
   ('Tools and integrations','MCP tools through AgentCore Gateway for iThenticate (similarity), Crossref (references), ORCID (identity), image forensics and COI / sanctions screening, each with a timeout and circuit breaker.'),
   ('Data','Files in S3; parsed text from Textract and Comprehend; findings and execution fingerprints in DynamoDB; hot results in ElastiCache.'),
   ('APIs and events','POST /triage/cases/{caseId}/agent-runs; GET …/integrity-findings; PATCH /triage/integrity-findings/{id} for override; publishes IntegrityAssessed.'),
   ('Design choices','Parallel runtime with no orchestration reasoning for speed and cost; incremental processing reuses results for unchanged sections; partial results recorded if a vendor is unavailable.'),
  ]),
 dict(n=4, l='d', t='MSC Transfer to another journal',
  obj='When the review or editorial assessment concludes that a manuscript fits another ACS journal better, recommend destinations within the Author\'s authorization and transfer it with the same manuscript identity and the history the receiving journal may see.',
  agent='Transfer agent (destination.recommend), advanced runtime with human in the loop',
  sc='Recommended destination accepted by the Editor in at least 70% of transfers; transfer completed with the same manuscript ID and no re-keying; no transfer outside the Author\'s authorization; transfer time cut by at least 50%.',
  design=[
   ('Trigger and orchestration','DecisionRecorded (transfer suggested, from review or a poor fit in POC 2) → Transfer & Portfolio Routing requests a destination.recommend run; after selection a Step Functions saga runs consent, package build and handoff.'),
   ('AI components','Transfer agent on AgentCore Runtime, reusing the manuscript summary and topics from POC 1; Claude on Bedrock for the rationale; Guardrails; human-in-the-loop checkpoints for selection and consent.'),
   ('Data','Authorization and routes in Aurora PostgreSQL; transfer package in S3 (versioned, KMS); history visibility rules per destination applied when the package is built.'),
   ('Integrations','Receiving journal notified through EventBridge API destinations; Author consent request and notices sent through SES; status synced back to Chronosub.'),
   ('APIs and events','GET …/destination-recommendations; POST /triage/cases/{caseId}/transfers; POST …/transfers/{id}/rollback; publishes DestinationRecommended, ManuscriptTransferred.'),
   ('Design choices','Saga with compensating steps undoes a failed transfer; manuscript ID preserved; authorization checked before recommending and again before transfer.'),
  ]),
 dict(n=5, l='e', t='Editor auto-assignment when an MSC appears on the Dashboard',
  obj="As soon as a manuscript appears on the journal's dashboard, find the eligible and available Editors and assign the Handling Editor automatically when the journal's policy allows it and the recommendation is confident.",
  agent='Editor Recommendation agent (editor.recommend), advanced runtime with human in the loop',
  sc='Editor assigned within minutes of the manuscript reaching the dashboard; auto-assigned or top-ranked Editor accepted in at least 80% of cases; zero conflict-of-interest violations; time to assignment cut by at least 50%.',
  design=[
   ('Trigger and orchestration','A manuscript reaches the dashboard (Triage & Work Queue publishes MscQueued once ContextReady arrives) → Editor Assignment requests an editor.recommend run at once. Advanced runtime (graph) with a human-in-the-loop checkpoint.'),
   ('Journal policy','Per journal in Workflow & Policy Config (Aurora PostgreSQL): auto-assignment on or off, confidence threshold, Editor board and maximum load per Editor.'),
   ('AI components','Editor Recommendation agent on AgentCore Runtime; SageMaker ranking model trained on past assignments and overrides; Claude on Bedrock for the explanation text.'),
   ('Data','Expertise and conflict graph in Neptune; Editor profiles indexed in OpenSearch; live workload and availability in ElastiCache; assignments in Aurora PostgreSQL.'),
   ('Auto-assignment rule','Assign automatically when the journal policy allows it, the top candidate passes eligibility and conflict checks, has capacity, is available and the score is above the threshold; otherwise route to the Assignment Console for the Assignment Authority.'),
   ('APIs and events','GET /triage/cases/{caseId}/editor-recommendations; POST /triage/cases/{caseId}/assignments; publishes EditorRecommended, EditorAssigned; the dashboard updates over WebSocket.'),
   ('Design choices','Optimistic locking prevents double assignment; an Editor decline re-runs the ranking without that Editor; manual assignment is always available if the agent is unavailable; overrides feed model retraining.'),
  ]),
 dict(n=6, l='f', t='Reviewer look-up and proposal for MSCs without a Reviewer',
  obj='For every manuscript on the dashboard that has no Reviewer assigned yet, look up and propose the best Reviewers based on Reviewer availability, applicability for the selected journal, capacity and past experience with similar manuscripts.',
  agent='Reviewer Recommendation agent (reviewer.recommend), advanced runtime with human in the loop',
  sc='At least 70% of invited Reviewers come from the top 5 proposed; zero proposals of unavailable, over-capacity or conflicted Reviewers; Reviewer acceptance rate above the current baseline; time from Editor assignment to first invitation cut by at least 50%.',
  design=[
   ('Trigger and orchestration','The dashboard lists manuscripts with no Reviewer assigned → ReviewerLookupRequested (on EditorAssigned, on dashboard load for unassigned manuscripts, and on a declined or expired invitation) → Reviewer Mgmt & Invitation requests a reviewer.recommend run. Advanced runtime with a human-in-the-loop checkpoint.'),
   ('Selection parameters','Four parameters (table below): availability, journal applicability and capacity act as gates and add to the score; past experience with similar manuscripts carries the largest weight. Conflict of interest is always a hard exclusion.'),
   ('AI components','Reviewer Recommendation agent on AgentCore Runtime; embeddings of the POC 1 summary compared with the manuscripts each Reviewer has reviewed; SageMaker ranking model for the weighted score; Claude on Bedrock for a short reason per parameter.'),
   ('Data','Reviewer pool, journal eligibility, subject areas and availability calendar in Aurora PostgreSQL; live open-review counts in ElastiCache; review-history vectors in OpenSearch; conflict graph in Neptune.'),
   ('Dashboard','A "Proposed Reviewers" panel per manuscript: the top 5 with a score and one reason per parameter; the Handling Editor picks and invites in one step.'),
   ('APIs and events','GET /triage/cases/{caseId}/reviewer-candidates; POST /triage/cases/{caseId}/reviewer-invitations; publishes ReviewerCandidatesProposed, ReviewerInvited.'),
   ('Design choices','Step Functions handles invitations, reminders and expiry; a decline or expiry re-runs the look-up without that Reviewer; weights are configurable per journal; manual search is always available.'),
  ],
  params=[
   ('Reviewer availability','On leave, paused or blocked in the review window','Response time and acceptance rate over the last 12 months','Availability calendar and invitation history (Aurora)','15%'),
   ('Reviewer applicability for the selected journal',"Not in the selected journal's Reviewer pool, or no matching subject area",'Reviews completed for this journal','Journal Reviewer pool and subject areas (Aurora)','25%'),
   ('Reviewer capacity','Open reviews at or above the Reviewer\'s or the journal\'s limit','Remaining headroom (1 − open reviews ÷ limit)','Live review load (ElastiCache)','20%'),
   ('Reviewer past experience with similar MSCs','None','Similarity of this manuscript to manuscripts the Reviewer reviewed, weighted by review quality and on-time rate','Review-history vectors (OpenSearch)','40%'),
   ('Conflict of interest','Co-authorship, same institution, or excluded by the Author','None','Conflict graph (Neptune)','Hard exclusion'),
  ]),
]

def build():
    o = ['<p><strong>Index</strong></p><ac:structured-macro ac:name="toc" ac:schema-version="1"><ac:parameter ac:name="minLevel">1</ac:parameter><ac:parameter ac:name="maxLevel">2</ac:parameter><ac:parameter ac:name="outline">false</ac:parameter><ac:parameter ac:name="style">none</ac:parameter><ac:parameter ac:name="type">list</ac:parameter></ac:structured-macro><hr />']
    o.append('<h1>10. Proposed POC use cases</h1>')
    o.append('<ac:structured-macro ac:name="info" ac:schema-version="1"><ac:rich-text-body><p><strong>Updated 28 Nov 2026.</strong> Use cases re-ordered. The earlier combined Editor and Reviewer look-up is now two use cases: Editor auto-assignment (POC 5) and Reviewer look-up and proposal (POC 6), which works on Reviewer availability, applicability for the selected journal, capacity and past experience with similar manuscripts. Every use case has a functional flow and architecture diagram and a technical process flow.</p></ac:rich-text-body></ac:structured-macro>')
    o.append('<p>Six AI-based use cases are proposed for proof of concept. POC 1 to 3 build the manuscript profile, fit and readiness signals; POC 4 to 6 reuse them to route the manuscript and staff it with an Editor and Reviewers. Each runs on the Base AI Framework (section 9), reuses the TR microservices and AWS services in sections 7 and 8, and keeps the Editor in control of every decision. Success criteria are proposed targets, to be confirmed against a baseline from historical manuscripts.</p>')
    o.append(table(['POC', 'Objective', 'AI agent and runtime', 'Success criteria (proposed)'],
                   [(f'POC {p["n"]}: {p["t"]}', p['obj'], p['agent'], p['sc']) for p in P], [331, 551, 367, 551]))
    for p in P:
        n = p['n']; f1 = 10 + 2*(n-1); f2 = f1 + 1
        o.append(f'<h2>10.{p["l"]} POC {n}: {E(p["t"])}</h2>')
        o.append('<h3>i. Functional flow and functional architecture</h3>')
        o.append(img(f'TR-Figure{f1}-POC-{n}-{SLUG[n]}-Functional-Flow-And-Architecture.png', f'Figure {f1}. POC {n} functional flow and functional architecture'))
        o.append('<h3>ii. Technical solution architecture and design</h3>')
        o.append(table(['Aspect', 'Design'], p['design'], [436, 1364]))
        if p.get('params'):
            o.append('<p><strong>Reviewer selection parameters.</strong> A gate removes a Reviewer from the proposal; the weighted score ranks the Reviewers who pass every gate. Weights are proposed defaults, configurable per journal.</p>')
            o.append(table(['Parameter', 'Gate (excluded when)', 'Score signal', 'Data source', 'Weight'], p['params'], [330, 400, 480, 400, 190]))
        o.append('<h3>iii. Technical process flow</h3>')
        o.append(img(f'TR-Figure{f2}-POC-{n}-{SLUG[n]}-Technical-Process-Flow.png', f'Figure {f2}. POC {n} technical process flow (one row per architecture layer; numbered steps show the order)'))
    return ''.join(o)

if __name__ == '__main__':
    open(os.path.join(D, 'confluence_head.xml'), 'w').write(build())
    print(len(build()))
