"""Trains the two predictive models shown on the dashboard (numpy logistic regression, out-of-time test).

Model 1 - Probability of Default: loan reaches 90+ DPD (or is written off) within 12 months of disbursement.
          Train: loans disbursed Jan 2021 - Jun 2024.  Out-of-time test: Jul 2024 - Oct 2025.
          Scored: every loan open on 31 Oct 2026.
Model 2 - Early warning: a performing (0 DPD) open loan has an instalment falling due in the next
          30 days that is paid late or missed.  Train: month-ends Jan 2023 - Dec 2025.
          Out-of-time test: Jan - Jun 2026 (labels settled through Jul 2026).  Scored: loans open on 31 Oct 2026.
Feature importance is mean |SHAP|; for a linear-logit model with standardised inputs the exact
(interventional) SHAP value of a feature is coef * (x - mean(x)), summed over a categorical's dummies.
"""
import json, os
import numpy as np
import pandas as pd
import pit

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
AOD = pit.AOD
SETTLED = pd.Timestamp("2026-07-31")
rng = np.random.default_rng(7)

L = pd.read_pickle(os.path.join(OUT, "_loans.pkl"))
D = pit.load()
disb, sch = pit.prepare(D["disb"], D["sch"])
app, cust, snap = D["app"], D["cust"], D["snap"]
n = len(L)


# ---------- logistic regression ----------
class Logit:
    def __init__(self, num, cat, l2=1.0):
        self.num, self.cat, self.l2 = num, cat, l2

    def design(self, df, fit=False):
        X = []
        names = []
        if fit:
            self.mu = df[self.num].mean(); self.sd = df[self.num].std().replace(0, 1)
            self.levels = {c: df[c].astype(str).value_counts().index[:20].tolist() for c in self.cat}
        Z = ((df[self.num] - self.mu) / self.sd).fillna(0).values
        X.append(Z); names += [(c, c) for c in self.num]
        for c in self.cat:
            v = df[c].astype(str).values
            for lv in self.levels[c][1:]:
                X.append((v == lv).astype(float)[:, None]); names.append((c, lv))
        self.names = names
        return np.hstack(X)

    def fit(self, df, y):
        X = self.design(df, fit=True)
        X1 = np.hstack([np.ones((len(X), 1)), X])
        w = np.zeros(X1.shape[1]); w[0] = np.log(y.mean() / (1 - y.mean()))
        R = np.eye(len(w)) * self.l2; R[0, 0] = 0
        for _ in range(30):  # IRLS / Newton
            p = 1 / (1 + np.exp(-X1 @ w))
            g = X1.T @ (p - y) + R @ w
            H = (X1 * (p * (1 - p))[:, None]).T @ X1 + R
            step = np.linalg.solve(H, g); w -= step
            if np.abs(step).max() < 1e-7: break
        self.w = w
        self.xmean = X.mean(0)
        return self

    def predict(self, df):
        X = self.design(df)
        return 1 / (1 + np.exp(-(self.w[0] + X @ self.w[1:]))), X

    def shap(self, X):
        contrib = (X - self.xmean) * self.w[1:]
        feats = {}
        for j, (f, _) in enumerate(self.names):
            feats.setdefault(f, np.zeros(len(X)))
            feats[f] += contrib[:, j]
        return feats


def auc(y, p):
    o = np.argsort(p); r = np.empty(len(p)); r[o] = np.arange(1, len(p) + 1)
    n1 = y.sum(); n0 = len(y) - n1
    return (r[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)


def curves(y, p, model):
    o = np.argsort(-p); ys = y[o]
    tp = np.cumsum(ys); fp = np.cumsum(1 - ys)
    tpr, fpr = tp / ys.sum(), fp / (len(ys) - ys.sum())
    prec = tp / np.arange(1, len(ys) + 1)
    pick = np.unique(np.linspace(0, len(ys) - 1, 101).astype(int))
    rows = [dict(model=model, curve="roc", x=0.0, y=0.0)]
    rows += [dict(model=model, curve="roc", x=round(fpr[i], 4), y=round(tpr[i], 4)) for i in pick]
    rows += [dict(model=model, curve="pr", x=round(tpr[i], 4), y=round(prec[i], 4)) for i in pick[1:]]
    pr_auc = float(np.sum(np.diff(np.r_[0, tpr]) * prec))
    dec = pd.qcut(pd.Series(p).rank(method="first"), 10, labels=False)
    cal = pd.DataFrame({"d": dec, "y": y, "p": p}).groupby("d").agg(pred=("p", "mean"), act=("y", "mean"), n=("y", "size"))
    rows += [dict(model=model, curve="calibration", x=round(r.pred, 5), y=round(r.act, 5), n=int(r.n), decile=int(d) + 1)
             for d, r in cal.iterrows()]
    return rows, pr_auc


def evaluate(model_name, m, tr, ytr, te, yte, thr_rule):
    ptr, _ = m.predict(tr)
    pte, Xte = m.predict(te)
    thr = np.quantile(ptr, thr_rule)  # flag the riskiest (1 - thr_rule) share of the training population
    pred = pte >= thr
    tp, fp = int((pred & (yte == 1)).sum()), int((pred & (yte == 0)).sum())
    fn, tn = int((~pred & (yte == 1)).sum()), int((~pred & (yte == 0)).sum())
    prec, rec = tp / max(tp + fp, 1), tp / max(tp + fn, 1)
    cr, pr_auc = curves(yte, pte, model_name)
    met = dict(model=model_name, roc_auc=auc(yte, pte), pr_auc=pr_auc, train_auc=auc(ytr, ptr), precision=prec,
               recall=rec, f1=2 * prec * rec / max(prec + rec, 1e-9), threshold=float(thr), tp=tp, fp=fp, fn=fn, tn=tn,
               train_n=len(tr), test_n=len(te), train_rate=float(ytr.mean()), test_rate=float(yte.mean()),
               test_pred_rate=float(pte.mean()))
    sh = m.shap(Xte)
    imp = sorted(((f, float(np.abs(v).mean()), float(np.corrcoef(te[f].fillna(0), v)[0, 1]) if f in m.num and v.std() > 0 else None)
                  for f, v in sh.items()), key=lambda r: -r[1])
    feats = [dict(model=model_name, feature=f, importance=round(i, 5), direction=None if d is None else round(d, 3))
             for f, i, d in imp]
    return met, cr, feats, pte, ptr


# ---------- shared origination features ----------
A = app.set_index("Application_ID")
F = L[["Loan_ID", "Customer_ID", "Disbursement_Date", "Principal_Amount", "Loan_Tenure_Months", "Interest_Rate_Annual",
       "Product_Name", "Loan_Purpose", "Repeat_Borrower_Flag", "Loan_Cycle_Number", "Credit_Risk_Score_At_Origination",
       "Age", "Gender", "Occupation_Category", "Division", "Urban_Rural_Category", "Education_Level",
       "Monthly_Income_Estimate", "Registration_Date", "def12", "mature12", "open", "out", "dpd"]].copy()
F["dti"] = L.Application_ID.map(A.Estimated_Debt_To_Income_Ratio).values
F["existing_outstanding"] = L.Application_ID.map(A.Existing_Outstanding_Amount).values
F["application_channel"] = L.Application_ID.map(A.Application_Channel).values
F["kyc"] = F.Customer_ID.map(cust.set_index("Customer_ID").KYC_Status)
F["account_age_m"] = (F.Disbursement_Date - F.Registration_Date).dt.days / 30.44
F["log_amount"] = np.log(F.Principal_Amount)
F["log_income"] = np.log(F.Monthly_Income_Estimate)
F["loan_to_income"] = F.Principal_Amount / F.Monthly_Income_Estimate

# prior repayment behaviour: customer's instalments due before this loan was disbursed
si = sch[["Customer_ID", "Loan_ID", "Due_Date", "Days_Past_Due", "Payment_Status"]].copy()
si["late"] = (si.Days_Past_Due > 0).astype(int)
si["missed"] = si.Payment_Status.isin(["Missed", "Overdue", "Waived"]).astype(int)
j = F[["Loan_ID", "Customer_ID", "Disbursement_Date"]].merge(si, on="Customer_ID", suffixes=("", "_i"))
j = j[(j.Due_Date < j.Disbursement_Date) & (j.Loan_ID_i != j.Loan_ID)]
pr = j.groupby("Loan_ID").agg(prior_inst=("late", "size"), prior_late=("late", "sum"), prior_missed=("missed", "sum"),
                              prior_max_dpd=("Days_Past_Due", "max"))
F = F.merge(pr, left_on="Loan_ID", right_index=True, how="left")
for c in ["prior_inst", "prior_late", "prior_missed", "prior_max_dpd"]: F[c] = F[c].fillna(0)
F["prior_ontime_ratio"] = np.where(F.prior_inst > 0, 1 - F.prior_late / F.prior_inst.clip(lower=1), np.nan)
F["no_history"] = (F.prior_inst == 0).astype(int)
F["prior_ontime_ratio"] = F.prior_ontime_ratio.fillna(1.0)

# wallet behaviour: latest monthly snapshot before the date
snap_s = snap[["Customer_ID", "Snapshot_Month", "Average_Wallet_Balance", "Monthly_Transaction_Count",
               "Savings_Activity_Flag"]].sort_values("Snapshot_Month")
snap_s["Snapshot_Month"] = snap_s.Snapshot_Month.astype("datetime64[ns]")


def wallet_asof(df, date_col):
    x = df[["Customer_ID", date_col]].reset_index().sort_values(date_col)
    x[date_col] = x[date_col].astype("datetime64[ns]")
    m = pd.merge_asof(x, snap_s, left_on=date_col, right_on="Snapshot_Month", by="Customer_ID", direction="backward")
    m = m.set_index("index").reindex(df.index)
    out = pd.DataFrame(index=df.index)
    out["log_wallet"] = np.log1p(m.Average_Wallet_Balance)
    out["txn_count"] = m.Monthly_Transaction_Count
    out["saver"] = m.Savings_Activity_Flag.astype(float)
    out["no_wallet_data"] = m.Average_Wallet_Balance.isna().astype(int)
    for c in ["log_wallet", "txn_count", "saver"]:
        out[c] = out[c].fillna(out[c].median())
    return out


F = F.join(wallet_asof(F, "Disbursement_Date"))

NUM1 = ["log_amount", "Loan_Tenure_Months", "Interest_Rate_Annual", "Loan_Cycle_Number", "Credit_Risk_Score_At_Origination",
        "Age", "log_income", "dti", "loan_to_income", "existing_outstanding", "account_age_m", "prior_late",
        "prior_missed", "prior_max_dpd", "prior_ontime_ratio", "no_history", "log_wallet", "txn_count", "saver",
        "no_wallet_data"]
CAT1 = ["Product_Name", "Loan_Purpose", "Occupation_Category", "Division", "Urban_Rural_Category", "Education_Level",
        "Gender", "kyc", "application_channel"]

lab = F[F.mature12]
tr = lab[lab.Disbursement_Date < "2024-07-01"]
te = lab[lab.Disbursement_Date >= "2024-07-01"]
m1 = Logit(NUM1, CAT1, l2=1.0).fit(tr, tr.def12.values.astype(float))
met1, cur1, feat1, p_te1, p_tr1 = evaluate("PD", m1, tr, tr.def12.values, te, te.def12.values, 0.85)
print("PD", {k: round(v, 4) if isinstance(v, float) else v for k, v in met1.items()})

# score today's open book
book = F[F.open].copy()
book["pd"], _ = m1.predict(book)
book.loc[book.dpd >= 90, "pd"] = 1.0  # already defaulted


def risk_seg(p):
    return np.select([p < 0.02, p < 0.05, p < 0.10], ["Low risk", "Moderate risk", "High risk"], "Very high risk")


SEG_CUTS = "Low < 2% · Moderate 2–5% · High 5–10% · Very high ≥ 10% predicted 12-month PD"

# ---------- early-warning panel ----------
st_cache = {}
rows = []
ms = pd.date_range("2023-01-31", "2026-06-30", freq="ME")
due = sch.Due_Date.values
li = sch.li.values
dpd_rec = sch.Days_Past_Due.values
part = (sch.Partial_Payment_Flag.values) & (sch.Days_Past_Due.values == 0)
Fi = F.reset_index(drop=True)
for M in list(ms) + [AOD]:
    s = pit.state_at(M, disb, sch)
    Mv = np.datetime64(M, "ns")
    perf = s.open.values & (s.dpd.values == 0)
    nxt = (due > Mv) & (due <= Mv + np.timedelta64(30, "D"))
    has_next = np.zeros(n, bool); has_next[li[nxt]] = True
    y = np.zeros(n); np.maximum.at(y, li[nxt], (dpd_rec[nxt] > 0).astype(float))
    past = due <= Mv
    late_sofar = np.bincount(li[past], weights=(dpd_rec[past] > 0), minlength=n)
    paid_sofar = np.bincount(li[past], minlength=n)
    part_sofar = np.bincount(li[past], weights=part[past], minlength=n)
    keep = perf & has_next
    idx = np.where(keep)[0]
    if M != AOD and len(idx) > 6000:
        idx = rng.choice(idx, 6000, replace=False)
    r = Fi.loc[idx].copy()
    r["snap_date"] = M
    r["mob"] = (M - r.Disbursement_Date).dt.days / 30.44
    r["repaid_share"] = 1 - s.out.values[idx] / r.Principal_Amount.values
    r["loan_late_sofar"] = late_sofar[idx]
    r["loan_inst_sofar"] = paid_sofar[idx]
    r["loan_partial_sofar"] = part_sofar[idx]
    r["y30"] = y[idx]
    rows.append(r)
P = pd.concat(rows, ignore_index=True)
w = wallet_asof(P, "snap_date").add_suffix("_now")
P = P.join(w)
NUM2 = ["mob", "repaid_share", "loan_late_sofar", "loan_inst_sofar", "loan_partial_sofar", "log_amount",
        "Loan_Tenure_Months", "Credit_Risk_Score_At_Origination", "dti", "loan_to_income", "prior_late",
        "prior_missed", "prior_ontime_ratio", "no_history", "log_wallet_now", "txn_count_now", "saver_now",
        "no_wallet_data_now", "Loan_Cycle_Number", "Age"]
CAT2 = ["Product_Name", "Occupation_Category", "Division", "Urban_Rural_Category"]
tr2 = P[P.snap_date <= "2025-12-31"]
te2 = P[(P.snap_date > "2025-12-31") & (P.snap_date <= "2026-06-30")]
m2 = Logit(NUM2, CAT2, l2=1.0).fit(tr2, tr2.y30.values)
met2, cur2, feat2, p_te2, p_tr2 = evaluate("Early warning", m2, tr2, tr2.y30.values, te2, te2.y30.values, 0.85)
print("EWS", {k: round(v, 4) if isinstance(v, float) else v for k, v in met2.items()})
now = P[P.snap_date == AOD].copy()
now["p30"], _ = m2.predict(now)

# ---------- outputs ----------
def dump(name, df):
    recs = json.loads(pd.DataFrame(df).replace([np.inf, -np.inf], np.nan).to_json(orient="records", double_precision=6))
    with open(os.path.join(OUT, f"{name}.json"), "w", encoding="utf-8") as f:
        json.dump(recs, f, ensure_ascii=False, separators=(",", ":"))
    print(name, len(recs))


labels = {"log_amount": "Loan amount", "Loan_Tenure_Months": "Loan tenure", "Interest_Rate_Annual": "Interest rate",
          "Loan_Cycle_Number": "Loan cycle number", "Credit_Risk_Score_At_Origination": "Credit score at origination",
          "Age": "Age", "log_income": "Monthly income", "dti": "Debt-to-income ratio", "loan_to_income": "Loan-to-income ratio",
          "existing_outstanding": "Existing outstanding balance", "account_age_m": "Account tenure",
          "prior_late": "Previous late instalments", "prior_missed": "Previous missed instalments",
          "prior_max_dpd": "Previous worst DPD", "prior_ontime_ratio": "Historical on-time ratio",
          "no_history": "No repayment history", "log_wallet": "Average wallet balance", "txn_count": "Transaction count",
          "saver": "Savings activity", "no_wallet_data": "No wallet snapshot", "Product_Name": "Product",
          "Loan_Purpose": "Loan purpose", "Occupation_Category": "Occupation", "Division": "Division",
          "Urban_Rural_Category": "Urban / rural", "Education_Level": "Education", "Gender": "Gender", "kyc": "KYC status",
          "application_channel": "Application channel", "mob": "Months on book", "repaid_share": "Share of principal repaid",
          "loan_late_sofar": "Late instalments on this loan", "loan_inst_sofar": "Instalments due so far",
          "loan_partial_sofar": "Partial payments on this loan", "log_wallet_now": "Current wallet balance",
          "txn_count_now": "Current transaction count", "saver_now": "Current savings activity",
          "no_wallet_data_now": "No recent wallet snapshot"}
mets = []
for met in (met1, met2):
    for k, v in met.items():
        if k != "model": mets.append(dict(model=met["model"], metric=k, value=v))
dump("model_metrics", mets)
dump("model_curves", cur1 + cur2)
dump("model_features", [dict(r, label=labels.get(r["feature"], r["feature"])) for r in feat1[:15] + feat2[:15]])

# monitoring: PSI of the score on fixed training-decile bins, and AUC by quarter
def psi_rows(model, ptr, groups):
    edges = np.unique(np.quantile(ptr, np.linspace(0, 1, 11)))
    edges[0], edges[-1] = -np.inf, np.inf
    base = np.histogram(ptr, edges)[0] / len(ptr)
    out = []
    for name, p in groups:
        cur = np.histogram(p, edges)[0] / len(p)
        psi = float(np.sum((cur - base) * np.log(np.clip(cur, 1e-6, None) / np.clip(base, 1e-6, None))))
        out.append(dict(model=model, population=name, psi=round(psi, 4), n=len(p), mean_score=float(np.mean(p))))
    return out


mon = psi_rows("PD", p_tr1, [("Training (2021–Jun 2024)", p_tr1), ("Out-of-time test (Jul 2024–Oct 2025)", p_te1),
                             ("Current book (Oct 2026)", book.loc[book.dpd < 90, "pd"].values)])
mon += psi_rows("Early warning", p_tr2, [("Training (2023–2025)", p_tr2), ("Out-of-time test (Jan–Jun 2026)", p_te2),
                                         ("Current book (Oct 2026)", now.p30.values)])
dump("model_monitoring", mon)
q = te.assign(p=p_te1, q=te.Disbursement_Date.dt.to_period("Q").astype(str)).groupby("q")
perf = [dict(model="PD", period=k, auc=auc(g.def12.values, g.p.values), actual=g.def12.mean(), predicted=g.p.mean(), n=len(g))
        for k, g in q if g.def12.sum() > 5]
q2 = te2.assign(p=p_te2, q=te2.snap_date.dt.strftime("%Y-%m")).groupby("q")
perf += [dict(model="Early warning", period=k, auc=auc(g.y30.values, g.p.values), actual=g.y30.mean(), predicted=g.p.mean(), n=len(g))
         for k, g in q2 if g.y30.sum() > 5]
dump("model_performance_time", perf)

# risk segments of today's book, by division and occupation, with early-warning flags
book["segment"] = risk_seg(book.pd.values)
book = book.merge(now[["Loan_ID", "p30"]], on="Loan_ID", how="left")
book["ews_flag"] = book.p30 >= met2["threshold"]
seg_rows = []
for dim, col in [("All", None), ("Division", "Division"), ("Occupation", "Occupation_Category"), ("Product", "Product_Name")]:
    g = book.groupby(["segment"] + ([col] if col else []))
    a = g.agg(loans=("Loan_ID", "size"), borrowers=("Customer_ID", "nunique"), exposure=("out", "sum"),
              avg_pd=("pd", "mean"), ews_loans=("ews_flag", "sum"),
              ews_exposure=("out", lambda v: v[book.loc[v.index, "ews_flag"]].sum())).reset_index()
    a = a.rename(columns={col: "group"}) if col else a.assign(group="All")
    a.insert(0, "dim", dim)
    seg_rows.append(a)
segdf = pd.concat(seg_rows)
segdf["exposure"] = segdf.exposure.round(0); segdf["ews_exposure"] = segdf.ews_exposure.round(0)
dump("risk_segments", segdf)
# actual 12-month default rate by predicted segment on the out-of-time test
ts = te.assign(segment=risk_seg(p_te1), p=p_te1).groupby("segment").agg(
    loans=("Loan_ID", "size"), predicted=("p", "mean"), actual=("def12", "mean")).reset_index()
dump("segment_backtest", ts)
# early-warning watch list: top loans by predicted 30-day delinquency (synthetic IDs only, no personal data)
wl = now.sort_values("p30", ascending=False).head(60)
wl = wl.merge(book[["Loan_ID", "pd", "segment"]], on="Loan_ID", how="left")
dump("watchlist", wl[["Loan_ID", "Division", "Occupation_Category", "Product_Name", "out", "mob", "loan_late_sofar",
                      "prior_late", "p30", "pd", "segment"]].rename(columns={
    "Loan_ID": "loan_id", "Division": "division", "Occupation_Category": "occupation", "Product_Name": "product",
    "out": "outstanding", "loan_late_sofar": "late_on_loan", "prior_late": "late_before"}).round(
    {"outstanding": 0, "mob": 1, "p30": 4, "pd": 4}))
json.dump({"segments": SEG_CUTS}, open(os.path.join(OUT, "_model_notes.json"), "w"))
