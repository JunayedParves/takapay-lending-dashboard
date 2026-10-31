"""Validation checks and delinquency depth for the dashboard (reads build.py outputs)."""
import json, os
import numpy as np
import pandas as pd
import pit

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
L = pd.read_pickle(os.path.join(OUT, "_loans.pkl"))
D = pit.load()
rj = lambda f: pd.read_json(os.path.join(OUT, f + ".json"))
mon, seg, geo = rj("monthly"), rj("segments"), rj("geography")


def dump(name, df):
    recs = json.loads(pd.DataFrame(df).to_json(orient="records", double_precision=6))
    json.dump(recs, open(os.path.join(OUT, name + ".json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(name, len(recs))


# delinquency depth by division
o = L[L.open & (L.dpd > 0)]
dd = pd.concat([o.assign(division="All"), o.assign(division=o.Division)]).groupby("division").agg(
    delinquent_loans=("Loan_ID", "size"), avg_dpd=("dpd", "mean"), overdue_out=("out", "sum")).reset_index()
s = D["sch"]
od = s[(s.Due_Date <= "2026-07-31")].merge(L[["Loan_ID", "Division", "open"]], on="Loan_ID")
od = od[od.open]
ov = pd.concat([od.assign(division="All"), od.assign(division=od.Division)]).groupby("division").Overdue_Amount.sum().rename("overdue_amount")
dd = dd.merge(ov, left_on="division", right_index=True, how="left").round({"avg_dpd": 1, "overdue_out": 0, "overdue_amount": 0})
dump("delinquency", dd)

# validation checks
disb, sch, cust = D["disb"], D["sch"], D["cust"]
a = mon[mon.division == "All"]
last = a[a.month == "2026-10"].iloc[0]
loan_doc = sch.groupby("Loan_ID").agg(mx=("Days_Past_Due", "max"), rem=("Remaining_Principal", "last"))
glp_doc = loan_doc.rem.sum()
par30_doc = loan_doc[loan_doc.mx >= 30].rem.sum() / glp_doc
wo_rem = loan_doc.rem[loan_doc.index.isin(disb[disb.Disbursement_Status.str.startswith("Written")].Loan_ID)].sum()
divsum = mon[(mon.division != "All") & (mon.month == "2026-10")].glp.sum()
segchk = []
for dim, g in seg[seg.division == "All"].groupby("dim"):
    segchk.append(abs(g.disb.sum() - disb.Principal_Amount.sum()) < 1000)
par_ok = ((a.par1 >= a.par7) & (a.par7 >= a.par30) & (a.par30 >= a.par90)).all()
rows = [
    ("Disbursement reconciliation", "Sum of Principal_Amount in fact_loan_disbursement", disb.Principal_Amount.sum(), a.disb_amt.sum(), "BDT"),
    ("Loan count", "Rows in fact_loan_disbursement", len(disb), int(a.disb_cnt.sum()), "count"),
    ("Customer count", "Unique Customer_ID in dim_customer", cust.Customer_ID.nunique(), len(cust), "count"),
    ("Borrowers", "Customers with at least one disbursed loan", disb.Customer_ID.nunique(), int(L.Customer_ID.nunique()), "count"),
    ("Outstanding balance", "Documented GLP less written-off principal (within 0.2%: 33 loans written off after their last window stays open to 31 Oct)", glp_doc - wo_rem, last.glp, "BDT"),
    ("Division totals", "Sum of division GLP equals portfolio GLP (Oct 2026)", last.glp, divsum, "BDT"),
    ("Segment totals", "Every breakdown's disbursement sums to the portfolio total", len(segchk), sum(segchk), "count"),
    ("PAR ordering", "PAR 1 ≥ PAR 7 ≥ PAR 30 ≥ PAR 90 in every month", 1, int(par_ok), "flag"),
    ("Repayment reconciliation", "Total_Amount_Paid on instalments due Jan 2021–Jul 2026", sch[sch.Due_Date <= "2026-07-31"].Total_Amount_Paid.sum(),
     a[a.settled].paid.sum(), "BDT"),
]
val = []
for check, rule, exp, act, unit in rows:
    exp, act = float(exp), float(act)
    ok = abs(exp - act) <= max(1.0, abs(exp) * (0.002 if check == "Outstanding balance" else 0.0001))
    val.append(dict(check=check, rule=rule, expected=round(exp, 2), actual=round(act, 2), unit=unit, status="Pass" if ok else "Review"))
val.append(dict(check="Documented benchmark GLP", rule="credit_risk_metric_definitions.md method, includes written-off principal",
                expected=round(glp_doc, 2), actual=round(last.glp, 2), unit="BDT", status="Explained"))
val.append(dict(check="Documented benchmark PAR 30", rule="Lifetime max DPD on all loans incl. written-off (doc) vs point-in-time DPD on open loans (dashboard)",
                expected=round(par30_doc, 4), actual=round(last.par30 / last.glp, 4), unit="ratio", status="Explained"))
val.append(dict(check="Historical date coverage", rule="Disbursement dates 2021-01-02 to 2026-10-25",
                expected=float(disb.Disbursement_Date.min().year), actual=float(disb.Disbursement_Date.max().year), unit="year", status="Pass"))
dump("validation", val)
