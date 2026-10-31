"""Builds the aggregated datasets behind the TakaPay lending dashboard (JSON, one file per dataset)."""
import json, os
import numpy as np
import pandas as pd
import pit

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
os.makedirs(OUT, exist_ok=True)
AOD = pit.AOD
COF_RATE = 0.045
# repayment records are settled only for instalments due through July 2026 (later ones carry a
# placeholder 15% partial payment), so collection metrics stop there
SETTLED = pd.Timestamp("2026-07-31")

D = pit.load()
cust, geo, prod, app = D["cust"], D["geo"], D["prod"], D["app"]
disb, sch = pit.prepare(D["disb"], D["sch"])
rec = D["rec"]
n = len(disb)

# ---------- loan attributes ----------
L = disb.merge(cust[["Customer_ID", "Age", "Gender", "Division", "District", "Upazila", "Urban_Rural_Category",
                     "Occupation_Category", "Monthly_Income_Estimate", "Education_Level", "Account_Tenure_Months",
                     "Customer_Segment", "Registration_Date"]], on="Customer_ID", how="left")
L = L.merge(prod[["Product_ID", "Product_Name"]], left_on="Loan_Product_ID", right_on="Product_ID", how="left")
assert len(L) == n and (L.Loan_ID.values == disb.Loan_ID.values).all()

cut = lambda s, b, lab: pd.cut(s, b, labels=lab, right=True).astype(str)
L["age_band"] = cut(L.Age, [0, 24, 34, 44, 54, 200], ["18–24", "25–34", "35–44", "45–54", "55+"])
L["income_band"] = cut(L.Monthly_Income_Estimate, [0, 15000, 30000, 50000, 100000, 1e9],
                       ["Below ৳15k", "৳15k–30k", "৳30k–50k", "৳50k–100k", "৳100k+"])
L["acct_tenure_band"] = cut(L.Account_Tenure_Months, [0, 12, 24, 48, 72, 1e9],
                            ["Under 1 yr", "1–2 yrs", "2–4 yrs", "4–6 yrs", "6+ yrs"])
L["amount_band"] = cut(L.Principal_Amount, [0, 999, 5000, 10000, 20000, 30000, 50000, 1e9],
                       ["Below ৳1,000", "৳1,000–5,000", "৳5,001–10,000", "৳10,001–20,000", "৳20,001–30,000",
                        "৳30,001–50,000", "৳50,001–100,000"])
L["borrower_type"] = np.where(L.Repeat_Borrower_Flag, "Repeat", "New")
L["loan_tenure"] = L.Loan_Tenure_Months.astype(str) + (np.where(L.Loan_Tenure_Months == 1, " month", " months"))
L["year"] = L.Disbursement_Date.dt.year

# recorded default: any instalment that reached 90+ DPD, or written off
s90 = sch[sch.Days_Past_Due >= 90]
first90 = (s90.Due_Date + pd.Timedelta(days=90)).groupby(s90.li).min()
L["default_date"] = pd.Series(first90).reindex(np.arange(n)).values
wo = L.Disbursement_Status.str.startswith("Written-Off")
L.loc[wo & L.default_date.isna(), "default_date"] = L.close_date
L["def12"] = (L.default_date.notna() & (L.default_date <= L.Disbursement_Date + pd.Timedelta(days=365))).astype(int)
L["mature12"] = L.Disbursement_Date <= AOD - pd.Timedelta(days=365)

# instalment-level aggregates per loan (due on/before AOD)
sd = sch[sch.Due_Date <= SETTLED]
agg = pd.DataFrame({
    "inst_due": np.bincount(sd.li, minlength=n),
    "inst_ontime": np.bincount(sd.li, weights=(sd.Payment_Status == "Paid On Time"), minlength=n),
    "inst_late": np.bincount(sd.li, weights=(sd.Payment_Status == "Paid Late"), minlength=n),
    "inst_missed": np.bincount(sd.li, weights=sd.Missed_Payment_Flag | sd.Payment_Status.isin(["Overdue"]), minlength=n),
    "sched_amt": np.bincount(sd.li, weights=sd.Scheduled_Amount, minlength=n),
    "paid_amt": np.bincount(sd.li, weights=sd.Total_Amount_Paid, minlength=n),
    "interest": np.bincount(sch.li, weights=np.where(sch.Actual_Payment_Date <= AOD, sch.Actual_Interest_Paid, 0), minlength=n),
})
for c in agg: L[c] = agg[c].values
rc = rec.groupby("Loan_ID").Recovery_Cost.sum()
L["rec_cost"] = L.Loan_ID.map(rc).fillna(0).values
L["cof"] = L.Principal_Amount * COF_RATE * L.Loan_Tenure_Months / 12

cur = pit.state_at(AOD, disb, sch)
L["open"], L["out"], L["dpd"] = cur.open.values, cur.out.values, cur.dpd.values
L["ecl"], L["stage"] = pit.ecl(L.PD_At_Origination.values, L.out.values, L.dpd.values, cur.resch.values)
L.loc[~L.open, ["out", "ecl"]] = 0

DIVS = sorted(L.Division.unique())


def dump(name, df, **meta):
    df = df.replace([np.inf, -np.inf], np.nan)
    recs = json.loads(df.to_json(orient="records", double_precision=6))
    with open(os.path.join(OUT, f"{name}.json"), "w", encoding="utf-8") as f:
        json.dump(recs, f, ensure_ascii=False, separators=(",", ":"))
    print(name, len(df), f"{os.path.getsize(os.path.join(OUT, name + '.json')) / 1024:.0f} KB")


# ---------- 1. monthly portfolio series ----------
months = pd.date_range("2021-01-31", AOD, freq="ME")
rows = []
div_of = L.Division.values
cust_of = L.Customer_ID.values
pdo = L.PD_At_Origination.values
for M in months:
    s = pit.state_at(M, disb, sch)
    e, _ = pit.ecl(pdo, s.out.values, s.dpd.values, s.resch.values)
    o = s.open.values
    frame = pd.DataFrame({"division": div_of, "cust": cust_of, "open": o, "out": np.where(o, s.out, 0),
                          "dpd": s.dpd.values, "ecl": np.where(o, e, 0)})
    frame = frame[frame.open]
    for x in (1, 7, 30, 90):
        frame[f"par{x}"] = np.where(frame.dpd >= x, frame.out, 0)
    for dv, g in [("All", frame)] + list(frame.groupby("division")):
        rows.append(dict(month=M.strftime("%Y-%m"), division=dv, glp=g.out.sum(), active_loans=len(g),
                         borrowers=g.cust.nunique(), par1=g.par1.sum(), par7=g.par7.sum(), par30=g.par30.sum(),
                         par90=g.par90.sum(), ecl=g.ecl.sum()))
mon = pd.DataFrame(rows)
L["dmonth"] = L.Disbursement_Date.dt.strftime("%Y-%m")
dm = pd.concat([L.assign(division="All"), L.assign(division=L.Division)]).groupby(["dmonth", "division"]).agg(
    disb_amt=("Principal_Amount", "sum"), disb_cnt=("Loan_ID", "size"), new_cnt=("Repeat_Borrower_Flag", lambda v: (~v).sum()))
sd_all = sch[sch.Due_Date <= AOD]
sd2 = sd_all.assign(division=div_of[sd_all.li.values], month=sd_all.Due_Date.dt.strftime("%Y-%m"))
sd2["ontime"] = sd2.Payment_Status == "Paid On Time"
sd2["late"] = sd2.Payment_Status.isin(["Paid Late", "Rescheduled"]) | ((sd2.Payment_Status == "Partially Paid") & (sd2.Days_Past_Due > 0))
sd2["missed"] = sd2.Payment_Status.isin(["Missed", "Overdue", "Waived"])
cm = pd.concat([sd2.assign(division="All"), sd2]).groupby(["month", "division"]).agg(
    sched=("Scheduled_Amount", "sum"), paid=("Total_Amount_Paid", "sum"), inst=("Installment_ID", "size"),
    ontime=("ontime", "sum"), late=("late", "sum"), missed=("missed", "sum"), overdue=("Overdue_Amount", "sum"))
sp = sch[sch.Actual_Payment_Date <= AOD]
sp = sp.assign(division=div_of[sp.li.values], month=sp.Actual_Payment_Date.dt.strftime("%Y-%m"))
im = pd.concat([sp.assign(division="All"), sp]).groupby(["month", "division"]).Actual_Interest_Paid.sum().rename("interest")
cm = cm.reset_index()
cm["settled"] = cm.month <= SETTLED.strftime("%Y-%m")
cm = cm.set_index(["month", "division"])
mon = mon.merge(dm, left_on=["month", "division"], right_index=True, how="left") \
         .merge(cm, left_on=["month", "division"], right_index=True, how="left") \
         .merge(im, left_on=["month", "division"], right_index=True, how="left")
mon["settled"] = mon.settled.fillna(False).astype(bool)
mon = mon.fillna(0)
for c in ["glp", "par1", "par7", "par30", "par90", "ecl", "disb_amt", "sched", "paid", "overdue", "interest"]:
    mon[c] = mon[c].round(0)
dump("monthly", mon)

# ---------- 2. segment breakdowns (current + lifetime) ----------
DIMS = [("Product", "Product_Name"), ("Age group", "age_band"), ("Occupation", "Occupation_Category"),
        ("Gender", "Gender"), ("Income bracket", "income_band"), ("Education", "Education_Level"),
        ("Account tenure", "acct_tenure_band"), ("Urban / rural", "Urban_Rural_Category"),
        ("Borrower type", "borrower_type"), ("Loan purpose", "Loan_Purpose"),
        ("Risk grade at origination", "Risk_Grade_At_Origination"), ("Loan amount band", "amount_band"),
        ("Loan tenure", "loan_tenure"), ("Customer segment", "Customer_Segment")]
L["par30_amt"] = np.where(L.dpd >= 30, L.out, 0)
L["npl_amt"] = np.where(L.dpd >= 90, L.out, 0)
L["m12"] = L.mature12.astype(int)
L["def12m"] = L.def12 * L.m12
L["dti"] = L.Application_ID.map(app.set_index("Application_ID").Estimated_Debt_To_Income_Ratio)
L["loan_to_income"] = L.Principal_Amount / L.Monthly_Income_Estimate
seg_rows = []
for dim, col in DIMS:
    for dv, g in [("All", L)] + list(L.groupby("Division")):
        a = g.groupby(col).agg(
            borrowers=("Customer_ID", "nunique"), loans=("Loan_ID", "size"), disb=("Principal_Amount", "sum"),
            repeat_loans=("Repeat_Borrower_Flag", "sum"), glp=("out", "sum"), active_loans=("open", "sum"),
            par30=("par30_amt", "sum"), npl=("npl_amt", "sum"), ecl=("ecl", "sum"),
            inst_due=("inst_due", "sum"), inst_ontime=("inst_ontime", "sum"), inst_missed=("inst_missed", "sum"),
            sched=("sched_amt", "sum"), paid=("paid_amt", "sum"), interest=("interest", "sum"),
            fee=("Processing_Fee", "sum"), cof=("cof", "sum"), rec_cost=("rec_cost", "sum"),
            mature_loans=("m12", "sum"), def12=("def12m", "sum"), rate=("Interest_Rate_Annual", "mean"),
            tenure=("Loan_Tenure_Months", "mean"), lti=("loan_to_income", "median")).reset_index()
        a = a.rename(columns={col: "segment"})
        a.insert(0, "division", dv)
        a.insert(0, "dim", dim)
        seg_rows.append(a)
seg = pd.concat(seg_rows)
for c in ["disb", "glp", "par30", "npl", "ecl", "sched", "paid", "interest", "fee", "cof", "rec_cost"]:
    seg[c] = seg[c].round(0)
seg["rate"] = seg.rate.round(4); seg["tenure"] = seg.tenure.round(2); seg["lti"] = seg.lti.round(3)
seg["segment"] = seg.segment.astype(str)
dump("segments", seg)

# ---------- 3. geography (division / district / upazila) ----------
ttm0, ttm1 = AOD - pd.DateOffset(years=1), AOD - pd.DateOffset(years=2)
L["disb_ttm"] = np.where(L.Disbursement_Date > ttm0, L.Principal_Amount, 0)
L["disb_pttm"] = np.where((L.Disbursement_Date > ttm1) & (L.Disbursement_Date <= ttm0), L.Principal_Amount, 0)
sd_ttm = sd[sd.Due_Date > SETTLED - pd.DateOffset(years=1)]
L["sched_ttm"] = np.bincount(sd_ttm.li, weights=sd_ttm.Scheduled_Amount, minlength=n)
L["paid_ttm"] = np.bincount(sd_ttm.li, weights=sd_ttm.Total_Amount_Paid, minlength=n)
L["act_cust"] = np.where(L.open, L.Customer_ID, None)
geo_rows = []
for level, keys in [("division", ["Division"]), ("district", ["Division", "District"]),
                    ("upazila", ["Division", "District", "Upazila"])]:
    a = L.groupby(keys).agg(
        loans=("Loan_ID", "size"), disb=("Principal_Amount", "sum"), disb_ttm=("disb_ttm", "sum"),
        disb_pttm=("disb_pttm", "sum"), glp=("out", "sum"), par30=("par30_amt", "sum"), npl=("npl_amt", "sum"),
        ecl=("ecl", "sum"), borrowers=("act_cust", "nunique"), sched_ttm=("sched_ttm", "sum"),
        paid_ttm=("paid_ttm", "sum"), interest=("interest", "sum"), fee=("Processing_Fee", "sum"),
        cof=("cof", "sum"), rec_cost=("rec_cost", "sum"), mature_loans=("m12", "sum"), def12=("def12m", "sum")).reset_index()
    a["urban_share"] = a.set_index(keys).index.map(
        L[L.open].assign(u=L.Urban_Rural_Category == "Urban").groupby(keys).u.mean()).fillna(0).round(3)
    custs = cust.groupby(keys).Customer_ID.size()
    a["customers"] = a.set_index(keys).index.map(custs).fillna(0).astype(int)
    a.insert(0, "level", level)
    a["name"] = a[keys[-1]]
    geo_rows.append(a)
geo_df = pd.concat(geo_rows).rename(columns={"Division": "division", "District": "district", "Upazila": "upazila"})
geo_df["key"] = geo_df.level + ":" + geo_df.division + (":" + geo_df.district.fillna("")).where(geo_df.level != "division", "") \
    + (":" + geo_df.upazila.fillna("")).where(geo_df.level == "upazila", "")
for c in ["disb", "disb_ttm", "disb_pttm", "glp", "par30", "npl", "ecl", "sched_ttm", "paid_ttm", "interest", "fee", "cof", "rec_cost"]:
    geo_df[c] = geo_df[c].round(0)
dump("geography", geo_df.drop(columns=["district", "upazila"]).assign(
    district=geo_df.district.fillna(""), upazila=geo_df.upazila.fillna("")))

# ---------- 4. origination funnel ----------
app2 = app.merge(cust[["Customer_ID", "Division"]], on="Customer_ID", how="left")
app2["year"] = app2.Application_Date.dt.year.astype(str)
fun = []
for dv, g in [("All", app2)] + list(app2.groupby("Division")):
    for yr, h in [("All", g)] + list(g.groupby("year")):
        r = dict(division=dv, year=yr, applications=len(h), requested=round(h.Requested_Loan_Amount.sum()))
        for st in ["Approved", "Rejected", "Withdrawn", "Pending"]:
            r[st.lower()] = int((h.Application_Status == st).sum())
        dd = L if dv == "All" else L[L.Division == dv]
        dd = dd if yr == "All" else dd[dd.Application_ID.isin(h.Application_ID)]
        r["disbursed"] = len(dd)
        r["disb_amt"] = round(dd.Principal_Amount.sum())
        r["avg_score"] = round(h.Credit_Risk_Score.mean(), 1)
        fun.append(r)
dump("funnel", pd.DataFrame(fun))
rej = app2[app2.Application_Status == "Rejected"]
rj = pd.concat([rej.assign(division="All"), rej.assign(division=rej.Division)]).groupby(
    ["division", "Rejection_Reason"]).size().rename("rejections").reset_index().rename(columns={"Rejection_Reason": "reason"})
dump("rejections", rj)
# credit score and DTI bands at origination (mature loans only for default rate)
L["score_band"] = cut(L.Credit_Risk_Score_At_Origination, [0, 549, 599, 649, 699, 749, 799, 1000],
                      ["Below 550", "550–599", "600–649", "650–699", "700–749", "750–799", "800+"])
L["dti_band"] = cut(L.dti, [-1, 0.2, 0.3, 0.4, 0.5, 2], ["≤0.20", "0.21–0.30", "0.31–0.40", "0.41–0.50", ">0.50"])
L["lti_band"] = cut(L.loan_to_income, [-1, 0.25, 0.5, 1, 2, 1e9], ["≤0.25×", "0.25–0.5×", "0.5–1×", "1–2×", ">2×"])
bands = []
for dim, col in [("Credit score", "score_band"), ("Debt-to-income", "dti_band"), ("Loan-to-income", "lti_band")]:
    for dv, g in [("All", L)] + list(L.groupby("Division")):
        a = g.groupby(col).agg(loans=("Loan_ID", "size"), disb=("Principal_Amount", "sum"), mature_loans=("m12", "sum"),
                               def12=("def12m", "sum")).reset_index().rename(columns={col: "band"})
        a.insert(0, "division", dv); a.insert(0, "dim", dim)
        bands.append(a)
dump("bands", pd.concat(bands))

# ---------- 5. collections: ageing, roll rates, recovery ----------
def bucket(dpd):
    return np.select([dpd <= 0, dpd <= 7, dpd <= 30, dpd <= 60, dpd <= 90], ["Current", "1–7 DPD", "8–30 DPD",
                     "31–60 DPD", "61–90 DPD"], "90+ DPD")
L["bucket"] = bucket(L.dpd.values)
ag = L[L.open]
age_rows = pd.concat([ag.assign(division="All"), ag.assign(division=ag.Division)]).groupby(["division", "bucket"]).agg(
    loans=("Loan_ID", "size"), outstanding=("out", "sum"), overdue_loans=("inst_missed", "sum")).reset_index()
age_rows["outstanding"] = age_rows.outstanding.round(0)
dump("ageing", age_rows)

roll = []
states = {M: pit.state_at(M, disb, sch) for M in months[-13:]}
ms = list(states)
for a_, b_ in zip(ms[:-1], ms[1:]):
    s0, s1 = states[a_], states[b_]
    m = s0.open.values
    fb = bucket(s0.dpd.values[m])
    tb = np.where(s1.open.values[m], bucket(s1.dpd.values[m]), "Closed / written off")
    tb = np.where((~s1.open.values[m]) & (L.Disbursement_Status.str.startswith("Written").values[m]) &
                  (L.close_date.values[m] <= np.datetime64(b_)), "Written off", tb)
    tb = np.where(tb == "Closed / written off", "Repaid / closed", tb)
    fr = pd.DataFrame({"from": fb, "to": tb, "out": s0.out.values[m], "division": div_of[m]})
    roll.append(fr)
roll = pd.concat(roll)
rr = pd.concat([roll.assign(division="All"), roll]).groupby(["division", "from", "to"]).agg(
    loans=("out", "size"), outstanding=("out", "sum")).reset_index()
rr["outstanding"] = rr.outstanding.round(0)
dump("roll_rates", rr)

rec2 = rec.merge(cust[["Customer_ID", "Division"]], on="Customer_ID", how="left")
rec2["month"] = rec2.Collection_Date.dt.strftime("%Y-%m")
recs = []
for dim, col in [("Channel", "Collection_Channel"), ("Recovery stage", "Recovery_Type"),
                 ("Outcome", "Collection_Status"), ("Division", "Division")]:
    for dv, g in [("All", rec2)] + list(rec2.groupby("Division")):
        a = g.groupby(col).agg(actions=("Recovery_ID", "size"), collected=("Collection_Amount", "sum"),
                               balance_before=("Outstanding_Balance_Before_Collection", "sum"),
                               cost=("Recovery_Cost", "sum"), ptp=("Promise_To_Pay_Flag", "sum"),
                               ptp_kept=("Promise_Kept_Flag", "sum")).reset_index().rename(columns={col: "segment"})
        a.insert(0, "division", dv); a.insert(0, "dim", dim)
        recs.append(a)
rdf = pd.concat(recs)
for c in ["collected", "balance_before", "cost"]: rdf[c] = rdf[c].round(0)
dump("recovery", rdf)

# ---------- 6. vintages ----------
L["vq"] = L.Disbursement_Date.dt.to_period("Q").astype(str)
L["def_mob"] = np.ceil((L.default_date - L.Disbursement_Date).dt.days / 30.44)
L["obs_mob"] = np.floor((AOD - L.Disbursement_Date).dt.days / 30.44)
vin = []
MOBS = list(range(1, 25))
for ctype, keys in [("Quarter", ["vq"]), ("Year", ["year"]), ("Product", ["year", "Product_Name"]),
                    ("Borrower type", ["year", "borrower_type"])]:
    for dv, g in [("All", L)] + (list(L.groupby("Division")) if ctype in ("Quarter", "Year") else []):
        for k, h in g.groupby(keys):
            k = k if isinstance(k, tuple) else (k,)
            min_obs = h.obs_mob.min()
            for mob in MOBS:
                defs = ((h.def_mob <= mob) & h.default_date.notna())
                vin.append(dict(type=ctype, division=dv, cohort=str(k[0]), group=str(k[1]) if len(k) > 1 else "",
                                mob=mob, loans=len(h), disb=round(h.Principal_Amount.sum()),
                                defaults=int(defs.sum()), def_amt=round(h.Principal_Amount[defs].sum()),
                                observed=bool(min_obs >= mob)))
vdf = pd.DataFrame(vin)
# vintage PAR snapshot today
vp = L.groupby("year").agg(disb=("Principal_Amount", "sum"), glp=("out", "sum"), par30=("par30_amt", "sum"),
                           npl=("npl_amt", "sum")).reset_index()
dump("vintages", vdf)
dump("vintage_now", vp.round(0))

L.to_pickle(os.path.join(OUT, "_loans.pkl"))
print("done")
