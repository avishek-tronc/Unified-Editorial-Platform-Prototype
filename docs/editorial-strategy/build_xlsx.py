import sys; sys.path.insert(0,'.')
from usecases import ROWS, MODULES, ORDER
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.table import Table, TableStyleInfo
from collections import Counter
wb=Workbook(); ws=wb.active; ws.title="Use Cases"
hdr=["Sl. No#","Module Name","Use Case Title","Priority","Complexity","Needed for MVP","Dependency","Notes"]
ws.append(hdr)
for i,r in enumerate(ROWS,1):
    ws.append([i,MODULES[r[0]],r[1],r[3],r[4],r[5],r[6],r[7]])
widths=[8,34,58,14,12,15,36,80]
for c,w in zip("ABCDEFGH",widths): ws.column_dimensions[c].width=w
thin=Side(style="thin",color="BFBFBF")
for row in ws.iter_rows(min_row=1,max_row=ws.max_row):
    for cell in row:
        cell.alignment=Alignment(wrap_text=True,vertical="top")
        cell.border=Border(top=thin,bottom=thin,left=thin,right=thin)
for cell in ws[1]:
    cell.font=Font(bold=True,color="FFFFFF"); cell.fill=PatternFill("solid",fgColor="1F3864")
fills={"YES":"E2EFDA","NO":"FCE4D6","TBD":"EDEDED"}
for row in ws.iter_rows(min_row=2):
    f=fills.get(row[5].value); row[5].fill=PatternFill("solid",fgColor=f)
    if row[5].value=="TBD":
        for c in row: c.font=Font(italic=True,color="7F7F7F")
ws.freeze_panes="A2"; ws.auto_filter.ref=f"A1:H{ws.max_row}"
# Summary
s=wb.create_sheet("Summary")
s.append(["Module","Requirement doc","Use cases","Must Have","Should Have","Nice to Have","MVP = YES"])
docs={"GR":"GR v1","SIC":"SIC v1","IA":"IA v1","TR":"TR v4","RD":"RD v1","CW":"Not available (TBD)","WC":"Not available (TBD)","OI":"OI v1"}
for m in ORDER:
    rs=[r for r in ROWS if r[0]==m]; tbd=rs[0][3]=="TBD"
    s.append([MODULES[m],docs[m],"TBD" if tbd else len(rs)]+(["TBD"]*4 if tbd else [sum(r[3]==p for r in rs) for p in ("Must Have","Should Have","Nice to Have")]+[sum(r[5]=="YES" for r in rs)]))
for cell in s[1]: cell.font=Font(bold=True,color="FFFFFF"); cell.fill=PatternFill("solid",fgColor="1F3864")
for c,w in zip("ABCDEFG",[42,22,11,11,12,13,11]): s.column_dimensions[c].width=w
s.append([]); s.append(["Notes"])
for t in ["Priority, Complexity and MVP are proposed ratings derived from each doc's MVP section, evidence strength and integration effort; validate with module owners.",
 "Confluence page could not be opened (Atlassian sign-in required); the 8 modules are as listed in SIC v1 (SIC-REQ-012) and the GR boundary table.",
 "Notes column cites the source requirement IDs."]:
    s.append([t])
wb.save("/mnt/project-files/editorial-strategy/Editorial_Strategy_Use_Cases.xlsx")
for m in ORDER:
    rs=[r for r in ROWS if r[0]==m]; print(m,len(rs),sum(r[5]=="YES" for r in rs))
print(len(ROWS))
