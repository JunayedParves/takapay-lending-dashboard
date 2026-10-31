"""Point-in-time loan state engine shared by the dashboard build scripts.

For any month-end M it reconstructs, per loan:
  open      - disbursed on/before M and not yet closed / written off
  out       - outstanding principal = principal - principal actually paid on/before M
  dpd       - days past due = max(M - due) over instalments due on/before M that are
              still unsettled at M (an instalment is delinquent on [due, due + Days_Past_Due))
Written-off loans leave the portfolio at the end of their last delinquency window.
"""
import os

import numpy as np
import pandas as pd

# folder holding the source Parquet tables; override with MFS_DATA
DATA = os.environ.get("MFS_DATA", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "raw"))
AOD = pd.Timestamp("2026-10-31")


def load():
    rd = lambda f: pd.read_parquet(os.path.join(DATA, f + ".parquet"))
    cust, geo, prod = rd("dim_customer"), rd("dim_geography"), rd("dim_loan_product")
    app, disb, sch = rd("fact_loan_application"), rd("fact_loan_disbursement"), rd("fact_repayment_schedule")
    rec, snap = rd("fact_collection_recovery"), rd("fact_customer_monthly_snapshot")
    return dict(cust=cust, geo=geo, prod=prod, app=app, disb=disb, sch=sch, rec=rec, snap=snap)


def prepare(disb, sch):
    disb = disb.copy()
    sch = sch.sort_values(["Loan_ID", "Installment_Number"]).reset_index(drop=True)
    sch["delq_end"] = sch.Due_Date + pd.to_timedelta(sch.Days_Past_Due, "D")
    ps = sch.Payment_Status
    sch["unsettled"] = (sch.Days_Past_Due > 0) & (ps.isin(["Missed", "Overdue", "Waived"])
                                                 | ((ps == "Partially Paid") & (sch.Overdue_Amount > 0)))
    g = sch.groupby("Loan_ID")
    last_pay = g.Actual_Payment_Date.max()
    last_due = g.Due_Date.max()
    last_delq = g.delq_end.max()
    disb = disb.set_index("Loan_ID")
    st = disb.Disbursement_Status
    close = pd.Series(pd.NaT, index=disb.index, dtype="datetime64[ns]")
    closed = st.str.startswith("Closed")
    close[closed] = np.maximum(last_pay.reindex(disb.index)[closed].fillna(last_due.reindex(disb.index)[closed]),
                               disb.Disbursement_Date[closed])
    wo = st.str.startswith("Written-Off")
    close[wo] = last_delq.reindex(disb.index)[wo]
    disb["close_date"] = close  # NaT = still open at AOD
    disb = disb.reset_index()
    # integer loan index for fast numpy aggregation
    idx = pd.Series(np.arange(len(disb)), index=disb.Loan_ID)
    sch["li"] = idx.reindex(sch.Loan_ID).values
    return disb, sch


def state_at(M, disb, sch):
    """Return DataFrame indexed like disb with open/out/dpd at month-end M."""
    n = len(disb)
    Mv = np.datetime64(M, "ns")
    d0 = disb.Disbursement_Date.values
    cl = disb.close_date.values
    opened = (d0 <= Mv) & (np.isnat(cl) | (cl > Mv))
    li = sch.li.values
    paid_mask = (sch.Actual_Payment_Date.values <= Mv)
    paid = np.bincount(li, weights=np.where(paid_mask, sch.Actual_Principal_Paid.values, 0.0), minlength=n)
    out = np.clip(disb.Principal_Amount.values - paid, 0, None)
    due = sch.Due_Date.values
    # settled-late instalments are delinquent on [due, due + DPD); unsettled ones reach their
    # recorded DPD and stay there while the loan is open
    uns = sch.unsettled.values
    dl = (due <= Mv) & (uns | (sch.delq_end.values > Mv))
    age = (Mv - due).astype("timedelta64[D]").astype(np.int64)
    days = np.where(dl, np.where(uns, np.minimum(age, sch.Days_Past_Due.values), age), 0)
    dpd = np.zeros(n, dtype=np.int64)
    np.maximum.at(dpd, li, days)
    resch = np.zeros(n, dtype=bool)
    rm = (sch.Payment_Status.values == "Rescheduled") & (due <= Mv)
    resch[li[rm]] = True
    out = np.where(opened, out, 0.0)
    return pd.DataFrame({"open": opened & (out > 0.5), "out": out, "dpd": np.where(opened, dpd, 0), "resch": resch & opened})


LGD_PERF, LGD_IMP = 0.65, 0.80


def ecl(pd12, out, dpd, resch):
    """IFRS 9 style ECL per documented methodology (credit_risk_metric_definitions.md C.2)."""
    stage3 = dpd >= 90
    stage2 = (~stage3) & ((dpd >= 30) | resch)
    pdl = np.where(stage3, 1.0, np.where(stage2, np.minimum(0.95, 1.85 * pd12), pd12))
    lgd = np.where(stage3, LGD_IMP, LGD_PERF)
    return pdl * lgd * out, np.where(stage3, 3, np.where(stage2, 2, 1))
