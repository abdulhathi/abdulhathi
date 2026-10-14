---
title: pandas and NumPy for data tasks
goal: Clean, join, group, reshape and window healthcare data in pandas without loops, and explain why the vectorised version is faster.
minutes: 90
---

The JD asks for "data processing pipelines" and "feature engineering", so expect at least one data task. It could be a
pandas exercise in the coding round, or a "how would you compute 30-day readmissions?" discussion. Interviewers look for
three things: you think in whole columns, not loops; you know the difference between `agg`, `transform` and `merge`;
and you check your joins, nulls and dtypes.

All code here runs on **pandas 3** (installed in this lab), which differs from pandas 2 in a few ways worth mentioning in
an interview. The notes come first, then the problems.

## pandas cheat sheet

| Task | Code |
|---|---|
| Select rows and columns by label | `df.loc[df["age"] >= 65, ["patient_id", "age"]]` |
| Select by position | `df.iloc[:5, :2]` |
| Filter with several conditions | `df[(df.state == "CA") & (df.paid > 100)]`. Use `&`, `\|` and `~` with parentheses, never `and`/`or` |
| Membership | `df[df["cpt"].isin(["99213", "99214"])]` |
| New column | `df.assign(paid_per_day=df.paid / df.los)` |
| Group and summarise (one row per group) | `df.groupby("payer").agg(total=("paid", "sum"), n=("claim_id", "count"))` |
| Group and broadcast back (same length as df) | `df.groupby("payer")["paid"].transform("mean")` |
| Keep only some groups | `df.groupby("member_id").filter(lambda g: len(g) > 3)` |
| Join | `claims.merge(providers, on="npi", how="left", validate="many_to_one")` |
| Stack frames | `pd.concat([jan, feb], ignore_index=True)` |
| Long → wide | `df.pivot_table(index="month", columns="payer", values="paid", aggfunc="sum", fill_value=0)` |
| Wide → long | `df.melt(id_vars="patient_id", var_name="test", value_name="value")` |
| Duplicates | `df.drop_duplicates(subset=["member_id", "dos", "cpt"], keep="first")` |
| Missing values | `df.isna().sum()`, `df.fillna({"paid": 0})`, `df.dropna(subset=["member_id"])` |
| Dates | `pd.to_datetime(s, errors="coerce")`, `s.dt.to_period("M")`, `df.resample("D", on="admit").size()` |
| Previous row within a group | `df.groupby("patient_id")["discharge"].shift()` |
| Rolling window | `s.rolling(7).mean()` or, on a DatetimeIndex, `s.rolling("7D").mean()` |
| Bin numbers | `pd.cut(age, bins=[0, 18, 65, np.inf], right=False, labels=[...])` |
| Frequencies | `s.value_counts(normalize=True)` |

## agg vs transform vs apply

| Method | Output shape | Use it for |
|---|---|---|
| `groupby().agg(...)` | One row per group | Reports: totals and averages per payer |
| `groupby().transform(...)` | Same length as the input | Comparing a row with its group: share of the group total, fill with the group mean, z-score within a group |
| `groupby().filter(...)` | A subset of the input rows | "Members with more than 3 claims" |
| `groupby().apply(f)` | Whatever `f` returns | A last resort when nothing above fits. It calls Python once per group, so it's slow |

## What changed in pandas 3

- **Copy-on-Write is always on.** Any result you take from a DataFrame behaves like a copy. Changing a filtered subset never
  changes the original, and the old `SettingWithCopyWarning` is gone.
- **Chained assignment never works.** `df["a"][0] = 5` leaves `df` unchanged and warns. Write `df.loc[0, "a"] = 5`.
- **Strings get a real dtype.** Text columns default to the `str` dtype instead of `object`, and missing values are `NaN`.
  When PyArrow is installed it backs the column, which makes `.str` methods much faster; without it, pandas falls back
  to Python storage.
- **`groupby().apply` no longer passes the grouping columns** to your function.

## Vectorise, don't loop

`df.apply(f, axis=1)` and `iterrows()` run Python code once per row. A vectorised expression such as
`df.paid * 1.1` or `np.where(df.paid > 100, "high", "low")` runs as a single C loop over the whole column. The
difference is often 10–100×. Reach for `np.where`, `np.select`, `.str`, `.dt`, `map` with a dict, `merge`, and
`groupby().transform` before reaching for `apply`.

## Interview questions

### What is the difference between loc and iloc? {core}

`loc` selects by **label**: index labels and column names. Its slices include both ends (`df.loc["a":"c"]` includes `"c"`).
`iloc` selects by **integer position**, and its slices exclude the end, as in normal Python. With a default `RangeIndex`
the two look the same, until you filter or sort and the labels stop matching the positions.

```python
import pandas as pd

df = pd.DataFrame({"paid": [10, 20, 30]}, index=[2, 0, 1])
assert df.loc[0, "paid"] == 20      # the row labelled 0
assert df.iloc[0, 0] == 10          # the first row
assert df.loc[0:1, "paid"].tolist() == [20, 30]   # label slice includes the end
assert df.iloc[0:1, 0].tolist() == [10]           # position slice excludes the end
```

### When do you use transform instead of agg? {core}

Use `agg` when you want **one row per group**, as in a summary report. Use `transform` when you want a value **for every
original row** computed from its group, such as the group mean next to each row, so you can compare or fill. `transform`
returns a result aligned with the original index, so you can assign it straight back as a column.

```python
import pandas as pd

df = pd.DataFrame({"payer": ["A", "A", "B"], "paid": [100.0, 300.0, 50.0]})
summary = df.groupby("payer")["paid"].agg("sum")
assert summary.to_dict() == {"A": 400.0, "B": 50.0}

df["share_of_payer"] = df["paid"] / df.groupby("payer")["paid"].transform("sum")
assert df["share_of_payer"].tolist() == [0.25, 0.75, 1.0]
```

### Explain the merge types, and how you check a join is correct {core}

`inner` keeps only keys found on both sides. `left` keeps every left row and fills `NaN` where there's no match. `right`
is the mirror image, and `outer` keeps everything. To check a join: compare row counts before and after, pass
`validate="many_to_one"` (pandas raises if the right side has duplicate keys, which would silently multiply rows), and
use `indicator=True` to see which rows matched.

```python
import pandas as pd

claims = pd.DataFrame({"claim_id": [1, 2, 3], "npi": ["111", "222", "999"]})
providers = pd.DataFrame({"npi": ["111", "222"], "specialty": ["Cardiology", "Oncology"]})
joined = claims.merge(providers, on="npi", how="left", validate="many_to_one", indicator=True)
assert len(joined) == len(claims)
assert joined["_merge"].tolist() == ["both", "both", "left_only"]

dupes = pd.concat([providers, providers.iloc[[0]]])
try:
    claims.merge(dupes, on="npi", how="left", validate="many_to_one")
except pd.errors.MergeError:
    pass
else:
    raise AssertionError("duplicate provider keys should be caught")
```

### How do you handle missing values? {core}

First find out **why** they're missing, by checking with `df.isna().sum()` and asking the data owner. Then choose:

- drop the row (`dropna(subset=[...])`) when a key field is missing;
- fill with a constant when missing has a meaning (no claims means 0 paid);
- fill with a statistic, ideally per group (the median lab value for that test);
- or keep a "was missing" indicator column, because missingness itself can predict the outcome.

In ML pipelines, compute fill values on the **training set only**, or you leak information from the test set.

### Why is apply slow, and what do you use instead? {core}

`apply(axis=1)` calls a Python function once per row, with all the interpreter overhead of creating a Series for each row.
Vectorised operations run the whole column through compiled NumPy code. Replace it with arithmetic on columns,
`np.where` or `np.select` for conditions, `.map(dict)` for lookups, `.str` and `.dt` accessors, `merge` for joins to
reference data, and `groupby().transform` for per-group values.

```python
import numpy as np
import pandas as pd

df = pd.DataFrame({"paid": [50.0, 150.0, 1200.0]})
df["tier"] = np.select([df.paid < 100, df.paid < 1000], ["low", "medium"], default="high")
assert df["tier"].tolist() == ["low", "medium", "high"]
```

### What does Copy-on-Write change for you in pandas 3? {deep}

Every indexing result behaves like an independent copy. Modifying it never touches the parent, so the old ambiguity
behind `SettingWithCopyWarning` is gone. pandas still avoids real copying until someone writes, which makes it cheaper
too. The practical rule: change a DataFrame through `df.loc[rows, cols] = value` on that same object, never through
chained indexing like `df[mask]["col"] = value`.

### How do you make pandas use less memory on a large file? {deep}

- Read only the columns you need: `usecols=[...]`.
- Give explicit `dtype`s: `category` for repetitive strings such as payer or state, and smaller integers (`int32`).
- Read in chunks with `chunksize=` and aggregate as you go.
- Use Parquet instead of CSV, because it's columnar, compressed and typed.

When the data truly doesn't fit on one machine, move to Polars, DuckDB or Spark. Check usage with
`df.memory_usage(deep=True)`.

### What is broadcasting in NumPy? {core}

Broadcasting lets NumPy combine arrays of different shapes without copying data. Trailing dimensions must be equal or 1,
and a dimension of size 1 is stretched to match. For example, subtracting a shape `(3,)` row of column means from a
`(100, 3)` matrix centres every column in one expression. `axis=0` means "down the rows", giving one value per column.

```python
import numpy as np

X = np.array([[1.0, 10.0], [3.0, 30.0]])
centred = X - X.mean(axis=0)         # (2, 2) - (2,) broadcasts across rows
assert centred.tolist() == [[-1.0, -10.0], [1.0, 10.0]]
assert X.sum(axis=1).tolist() == [11.0, 33.0]   # axis=1: across columns, one value per row
```

### How do you get the top N rows per group? {core}

Sort by the group key and the value, then take `groupby(...).head(n)`. That's vectorised, and it keeps every column. For
exactly one row per group, `df.loc[df.groupby(key)[col].idxmax()]` works. `groupby()[col].nlargest(n)` works too, but it
returns a Series with a two-level index that you then have to join back. The full worked version is in the problems below.

### How would you join or aggregate data too big for pandas? {deep}

Push the work to where the data lives: SQL in the warehouse (BigQuery, Snowflake, Postgres), or a distributed engine
(Spark, Dask). For one large machine, Polars or DuckDB handle data bigger than pandas comfortably, with lazy query
planning. The concepts carry over unchanged: groupby, join, window, filter.

## Coding problems

### Clean a messy claims extract {medium core}

A partner sends a claims extract. Member ids have stray spaces and mixed case, dates come in mixed formats (one is not a
date at all), amounts look like `"$1,200.50"`, payer names vary in case, one row has no member id, and one row is an exact
duplicate once cleaned. Return a clean DataFrame: upper-case member ids, real datetimes (`NaT` where unparseable), numeric
amounts, lower-case payer names, no rows missing a member id, and no duplicates.

#### Hints

1. The `.str` accessor works on a whole column at once: `.str.strip().str.upper()`.
2. `pd.to_datetime(..., format="mixed", errors="coerce")` parses each value on its own and turns failures into `NaT`.
3. Remove `$` and `,` with a regex replace, then use `pd.to_numeric(..., errors="coerce")`.

#### Solution

Clean each column with vectorised string operations. Clean **before** deduplicating: `" m001"` and `"M001"` only
become duplicates after normalisation. `assign` keeps it as one readable chain.

```python
import pandas as pd

raw = pd.DataFrame({
    "member_id": [" m001", "M002 ", "M001", "m003", None],
    "service_date": ["2026-09-01", "2026/09/02", "2026-09-01", "not a date", "2026-09-05"],
    "amount": ["$1,200.50", "85", "$1,200.50", "$40.00", "12.5"],
    "payer": ["aetna", "AETNA ", "Aetna", "UnitedHealthcare", "cigna"],
})

clean = (
    raw.assign(
        member_id=raw["member_id"].str.strip().str.upper(),
        service_date=pd.to_datetime(raw["service_date"], format="mixed", errors="coerce"),
        amount=pd.to_numeric(raw["amount"].str.replace(r"[$,]", "", regex=True), errors="coerce"),
        payer=raw["payer"].str.strip().str.lower(),
    )
    .dropna(subset=["member_id"])
    .drop_duplicates()
    .reset_index(drop=True)
)

assert clean["member_id"].tolist() == ["M001", "M002", "M003"]
assert clean["amount"].tolist() == [1200.5, 85.0, 40.0]
assert clean["payer"].tolist() == ["aetna", "aetna", "unitedhealthcare"]
assert clean["service_date"].isna().tolist() == [False, False, True]
assert str(clean["service_date"].dtype).startswith("datetime64")
```

Complexity: O(n) per column, all vectorised.

#### Follow-ups

- **Is 03/04/2026 the 3rd of April or the 4th of March?** It's ambiguous. Ask the sender, then pass an explicit `format=`
  (or `dayfirst=True`). Never guess silently with healthcare dates.
- **Log what you dropped.** Count the coerced `NaT`/`NaN` values and the rows dropped, and report them. Silent data loss
  is the real bug.
- **Validate the schema up front?** Pandera, or Pydantic per record, can enforce types and ranges at the pipeline boundary.

### Top 2 claims by amount for each member {medium core}

For each member, return their two most expensive claims with all columns, ordered by member and then by amount from
highest to lowest.

#### Hints

1. Sort by member, then by amount descending.
2. After sorting, `groupby("member_id").head(2)` keeps the first two rows of each group.
3. A member with only one claim should still appear.

#### Solution

A sort followed by `groupby().head(n)` is the idiomatic, vectorised top-N per group. It keeps every column, unlike
`groupby()["amount"].nlargest()`, which returns only the amount column with a multi-level index.

```python
import pandas as pd

claims = pd.DataFrame({
    "claim_id": ["C1", "C2", "C3", "C4", "C5", "C6"],
    "member_id": ["M1", "M1", "M1", "M2", "M2", "M3"],
    "amount": [120.0, 980.0, 450.0, 75.0, 310.0, 60.0],
})

top2 = (
    claims.sort_values(["member_id", "amount"], ascending=[True, False])
    .groupby("member_id")
    .head(2)
    .reset_index(drop=True)
)
assert top2["claim_id"].tolist() == ["C2", "C3", "C5", "C4", "C6"]

# Exactly one row per group: idxmax gives the index label of each group's maximum.
biggest = claims.loc[claims.groupby("member_id")["amount"].idxmax()]
assert biggest["claim_id"].tolist() == ["C2", "C5", "C6"]
```

Complexity: O(n log n) for the sort.

#### Follow-ups

- **Ties at the boundary?** `head(2)` cuts arbitrarily among tied amounts. To keep all ties, use
  `groupby()["amount"].rank(method="dense", ascending=False) <= 2`.
- **In SQL?** `ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY amount DESC) <= 2`.

### Patients with no visits {easy core}

Given `patients` and `visits` tables, return the patients who have never had a visit.

#### Hints

1. An anti-join: keep left rows with no match on the right.
2. Option 1: `~patients["patient_id"].isin(visits["patient_id"])`.
3. Option 2: a left merge with `indicator=True`, keeping rows where `_merge == "left_only"`.

#### Solution

`isin` is the shortest anti-join. The merge-with-indicator version is worth knowing, because it also shows matches and
works on composite keys.

```python
import pandas as pd

patients = pd.DataFrame({"patient_id": ["P1", "P2", "P3", "P4"], "name": ["Ana", "Raj", "Lee", "Kim"]})
visits = pd.DataFrame({"visit_id": [1, 2, 3], "patient_id": ["P1", "P3", "P1"]})

no_visits = patients[~patients["patient_id"].isin(visits["patient_id"])]
assert no_visits["name"].tolist() == ["Raj", "Kim"]

m = patients.merge(visits[["patient_id"]].drop_duplicates(), on="patient_id", how="left", indicator=True)
assert m.loc[m["_merge"] == "left_only", "name"].tolist() == ["Raj", "Kim"]
```

Complexity: O(n + m) with hashing.

#### Follow-ups

- **Why `drop_duplicates` before the merge?** P1 has two visits. Without it, the merge duplicates P1's row. That's
  harmless here, but it's a common source of inflated counts.
- **In SQL?** `LEFT JOIN visits v ON ... WHERE v.patient_id IS NULL`, or `NOT EXISTS`.

### Keep only the latest record per patient {easy core}

An address table holds several versions per patient, each with an `updated_at` timestamp. Keep only the most recent row
for each patient.

#### Hints

1. Sort by `updated_at`.
2. `drop_duplicates(subset="patient_id", keep="last")` keeps the last, which is the latest, row per patient.
3. Alternative: `idxmax` on `updated_at` per group.

#### Solution

Sort, then deduplicate keeping the last row. This handles any number of versions per patient in one vectorised pass.

```python
import pandas as pd

addresses = pd.DataFrame({
    "patient_id": ["P1", "P2", "P1", "P1", "P2"],
    "city": ["Irvine", "Austin", "Tustin", "Anaheim", "Dallas"],
    "updated_at": pd.to_datetime(["2026-01-01", "2026-02-01", "2026-03-01", "2026-02-15", "2026-01-10"]),
})

latest = (
    addresses.sort_values("updated_at")
    .drop_duplicates(subset="patient_id", keep="last")
    .sort_values("patient_id")
    .reset_index(drop=True)
)
assert latest[["patient_id", "city"]].values.tolist() == [["P1", "Tustin"], ["P2", "Austin"]]
```

Complexity: O(n log n).

#### Follow-ups

- **Two rows with the same `updated_at`?** Add a tie-breaker column to the sort, such as a version number or load time.
  Otherwise the result depends on input order.
- **Keep the history instead?** That's a slowly changing dimension (SCD type 2): add `valid_from` and `valid_to` columns
  rather than deleting old rows.

### Fill missing lab values with the mean for that test {medium core}

Lab results have missing values. Fill each missing value with the mean of the **same test** (glucose with the glucose
mean, not the overall mean), and add a column flagging which values were filled.

#### Hints

1. Each row needs its own test's mean, lined up with the original rows. Which groupby method returns a result the same
   length as its input?
2. `groupby("test")["value"].transform("mean")`, passed to `fillna`, which fills by index alignment.
3. Record `isna()` **before** filling.

#### Solution

`transform` is the key: it broadcasts each group's mean back to every row, so `fillna` can line it up by index. The
indicator column keeps the information that a value was imputed, which is useful later as a model feature.

```python
import numpy as np
import pandas as pd

labs = pd.DataFrame({
    "patient_id": ["P1", "P2", "P3", "P1", "P2", "P3"],
    "test": ["glucose", "glucose", "glucose", "hba1c", "hba1c", "hba1c"],
    "value": [90.0, np.nan, 110.0, 5.4, 6.2, np.nan],
})

labs["was_missing"] = labs["value"].isna()
labs["value"] = labs["value"].fillna(labs.groupby("test")["value"].transform("mean"))

assert np.allclose(labs["value"], [90.0, 100.0, 110.0, 5.4, 6.2, 5.8])
assert labs["was_missing"].tolist() == [False, True, False, False, False, True]
assert labs["value"].iloc[-1] != 5.8   # (5.4 + 6.2) / 2 is 5.800000000000001 in floating point
```

The hba1c mean is (5.4 + 6.2) / 2 = 5.8, except that floating point stores it as 5.800000000000001. That's why the test
compares with `np.allclose` instead of `==`. Say so if an interviewer's expected output doesn't match exactly.

Complexity: O(n).

#### Follow-ups

- **Mean or median?** Lab values are often skewed by outliers, and the median is robust to them:
  `transform("median")`.
- **In a model pipeline?** Compute the group means on the training data only, store them, and apply them to new data.
  Or use scikit-learn's `SimpleImputer` inside a `Pipeline`.

### Flag 30-day readmissions {hard core}

Each row is a hospital stay: `patient_id`, `admit` and `discharge`. Flag a stay as a readmission when the patient was
admitted within 30 days (inclusive) of their **previous** discharge. Rows arrive unsorted. Return the flags in
`patient_id`, `admit` order, and the count of readmissions per patient.

#### Hints

1. Sort by patient and admit date. "Previous" only means something after sorting.
2. `groupby("patient_id")["discharge"].shift()` gives each stay its previous discharge, without crossing into another patient.
3. Subtracting dates gives a timedelta: use `.dt.days`. The first stay has no previous one (`NaT`), which must not count as a readmission.

#### Solution

The core trick is `shift` within a group. It's the pandas version of SQL's `LAG() OVER (PARTITION BY patient ORDER BY
admit)`. Comparing `NaN <= 30` gives `False`, so first stays are excluded automatically.

```python
import pandas as pd

stays = pd.DataFrame({
    "patient_id": ["P1", "P2", "P1", "P3", "P2", "P1"],
    "admit": pd.to_datetime(["2026-01-20", "2026-02-01", "2026-01-01", "2026-04-01", "2026-03-05", "2026-03-01"]),
    "discharge": pd.to_datetime(["2026-01-22", "2026-02-03", "2026-01-05", "2026-04-04", "2026-03-07", "2026-03-02"]),
})

s = stays.sort_values(["patient_id", "admit"]).reset_index(drop=True)
s["prev_discharge"] = s.groupby("patient_id")["discharge"].shift()
s["days_since_discharge"] = (s["admit"] - s["prev_discharge"]).dt.days
s["readmit_30"] = s["days_since_discharge"].le(30)

assert s["days_since_discharge"].fillna(-1).tolist() == [-1, 15, 38, -1, 30, -1]
assert s["readmit_30"].tolist() == [False, True, False, False, True, False]
per_patient = s.groupby("patient_id")["readmit_30"].sum()
assert per_patient.to_dict() == {"P1": 1, "P2": 1, "P3": 0}
```

P1 is readmitted 15 days after the 5 January discharge. The March stay comes 38 days after the 22 January discharge, so
it doesn't count. P2's second admission is exactly 30 days later, and counts because the window is inclusive.

Complexity: O(n log n) for the sort, then O(n).

#### Follow-ups

- **Real CMS readmission measures** exclude planned readmissions and transfers, and count against the index stay
  (unplanned readmission within 30 days of discharge, for specific conditions). Ask for the exact definition.
- **The readmission rate?** `s["readmit_30"].sum()` divided by the number of index stays eligible for follow-up.
- **As a model target?** Flag the *index* stay ("will this patient be readmitted?") rather than the readmission itself,
  using `shift(-1)` to look at the next admission.

### Monthly claim totals per payer {medium}

Turn a long list of claims into a table with one row per month and one column per payer, holding the total paid amount.
Months where a payer had no claims show 0.

#### Hints

1. Turn the date into a month with `.dt.to_period("M")`.
2. `pivot_table(index=..., columns=..., values=..., aggfunc="sum", fill_value=0)`.
3. `pivot` (without `_table`) fails when there are duplicate index/column pairs. `pivot_table` aggregates them.

#### Solution

This is a long-to-wide reshape with aggregation. `pivot_table` groups by month and payer, sums the amounts, and spreads
the payers across columns.

```python
import pandas as pd

claims = pd.DataFrame({
    "service_date": pd.to_datetime(["2026-01-05", "2026-01-20", "2026-02-02", "2026-02-15", "2026-03-01"]),
    "payer": ["Aetna", "Cigna", "Aetna", "Aetna", "Cigna"],
    "paid": [100.0, 50.0, 70.0, 30.0, 20.0],
})

monthly = claims.assign(month=claims["service_date"].dt.to_period("M")).pivot_table(
    index="month", columns="payer", values="paid", aggfunc="sum", fill_value=0
)
assert monthly.index.astype(str).tolist() == ["2026-01", "2026-02", "2026-03"]
assert monthly["Aetna"].tolist() == [100.0, 100.0, 0.0]
assert monthly["Cigna"].tolist() == [50.0, 0.0, 20.0]
```

Complexity: O(n) to group, plus the size of the output table.

#### Follow-ups

- **Add a total row and column?** Pass `margins=True, margins_name="Total"`.
- **Back to long format?** `monthly.reset_index().melt(id_vars="month", var_name="payer", value_name="paid")`.

### Rolling 7-day average of daily admissions {medium}

From admission timestamps, compute daily admission counts, **including days with zero admissions**, and a rolling 7-day
average. Days before a full 7-day window exists should have no average (`NaN`).

#### Hints

1. Count per day with `resample("D", on="admit").size()` or `.dt.floor("D").value_counts()`.
2. Days with no admissions must appear as 0: reindex onto a full `pd.date_range`.
3. `rolling(7).mean()` needs 7 values by default (`min_periods=7`).

#### Solution

The trap is missing days. A rolling window of 7 *rows* is only a 7-*day* window when every day has a row. Reindex onto
the full calendar with `fill_value=0` first.

```python
import pandas as pd

admits = pd.DataFrame({"admit": pd.to_datetime([
    "2026-10-01 08:00", "2026-10-01 14:00",
    "2026-10-03 09:00",
    "2026-10-04 01:00", "2026-10-04 10:00", "2026-10-04 23:00",
    "2026-10-06 12:00",
    "2026-10-08 07:00", "2026-10-08 19:00",
])})

days = pd.date_range("2026-10-01", "2026-10-08", freq="D")
daily = admits["admit"].dt.floor("D").value_counts().reindex(days, fill_value=0).sort_index()
assert daily.tolist() == [2, 0, 1, 3, 0, 1, 0, 2]

avg7 = daily.rolling(7).mean()
assert avg7.isna().tolist() == [True] * 6 + [False, False]
assert avg7.iloc[-2:].tolist() == [1.0, 1.0]   # (2+0+1+3+0+1+0)/7 and (0+1+3+0+1+0+2)/7
```

Complexity: O(n + d) for n admissions over d days.

#### Follow-ups

- **A time-based window instead?** On a DatetimeIndex, `daily.rolling("7D").mean()` uses the last 7 calendar days even
  with gaps. Note that its default `min_periods` is 1, so early values average fewer days.
- **Per hospital?** `df.groupby("hospital")` and then `rolling` on each group, or pivot the hospitals into columns first.

### One-hot encode categorical columns {easy}

Turn `payer` and `plan_type` into 0/1 indicator columns for a model, keeping the numeric columns as they are. Then explain
what goes wrong when the test data contains a payer the training data never had.

#### Hints

1. `pd.get_dummies(df, columns=[...], dtype=int)`.
2. In pandas 2 and later, dummies default to `bool`. Pass `dtype=int` for 0/1.
3. New or missing categories at prediction time change the columns. Align them to the training columns.

#### Solution

`get_dummies` works for exploration. For a model, the column set must be identical at training and prediction time, so
either reindex to the training columns or use scikit-learn's `OneHotEncoder(handle_unknown="ignore")`, which remembers
the categories it was fitted on.

```python
import pandas as pd

train = pd.DataFrame({"age": [40, 65, 30], "payer": ["Aetna", "Cigna", "Aetna"], "plan_type": ["HMO", "PPO", "PPO"]})
X_train = pd.get_dummies(train, columns=["payer", "plan_type"], dtype=int)
assert X_train.columns.tolist() == ["age", "payer_Aetna", "payer_Cigna", "plan_type_HMO", "plan_type_PPO"]
assert X_train.loc[0].tolist() == [40, 1, 0, 1, 0]

# A payer the model has never seen, and no HMO rows: the columns would differ.
test = pd.DataFrame({"age": [50], "payer": ["Humana"], "plan_type": ["PPO"]})
X_test = pd.get_dummies(test, columns=["payer", "plan_type"], dtype=int).reindex(columns=X_train.columns, fill_value=0)
assert X_test.columns.tolist() == X_train.columns.tolist()
assert X_test.loc[0].tolist() == [50, 0, 0, 0, 1]
```

Complexity: O(n × k) for k categories.

#### Follow-ups

- **Thousands of categories (ICD-10 codes)?** One-hot becomes huge and sparse. Group rare codes into "other", map codes
  to higher-level categories, or use target encoding (computed inside cross-validation, to avoid leakage) or hashing.
- **Linear models and the dummy trap?** Use `drop_first=True` to avoid perfectly correlated columns. Tree models don't need it.

### Find outlier lab values by z-score and by IQR {medium}

Flag lab values that are unusual **for their test**: by z-score (|z| > 2), and by the IQR rule (below Q1 − 1.5·IQR or
above Q3 + 1.5·IQR). Explain when each rule is the better choice.

#### Hints

1. Compute per-test mean and standard deviation with `groupby().transform`.
2. For IQR, compute Q1 and Q3 per test with `transform(lambda s: s.quantile(0.25))`.
3. The z-score is pulled by the outlier itself, because one huge value inflates the standard deviation. IQR is robust.

#### Solution

Both rules are computed per group with `transform`, so each row is compared with its own test's distribution. With small
groups, an extreme value inflates the standard deviation enough to hide itself. The IQR rule doesn't have that problem.

```python
import pandas as pd

labs = pd.DataFrame({
    "test": ["glucose"] * 8 + ["potassium"] * 6,
    "value": [92, 95, 88, 101, 97, 90, 94, 310,
              4.1, 3.9, 4.4, 4.0, 4.2, 9.8],
})
g = labs.groupby("test")["value"]

z = (labs["value"] - g.transform("mean")) / g.transform("std")
labs["z_outlier"] = z.abs() > 2

q1 = g.transform(lambda s: s.quantile(0.25))
q3 = g.transform(lambda s: s.quantile(0.75))
iqr = q3 - q1
labs["iqr_outlier"] = (labs["value"] < q1 - 1.5 * iqr) | (labs["value"] > q3 + 1.5 * iqr)

assert labs.loc[labs["iqr_outlier"], "value"].tolist() == [310, 9.8]
assert labs.loc[labs["z_outlier"], "value"].tolist() == [310, 9.8]
# With only 6 potassium values, the outlier inflates the std: its z-score is barely over 2.
pot_z = z[labs["test"] == "potassium"].abs().max()
assert 2 < pot_z < 2.1
```

Complexity: O(n) for the z-score. The quantiles cost O(n log n) per group in the worst case.

#### Follow-ups

- **Should you delete outliers?** Not automatically. In healthcare, a potassium of 9.8 might be a critical result or a
  haemolysed sample. Flag it, ask a domain expert, and keep the raw value.
- **Robust z-score?** Use the median and the MAD (median absolute deviation) instead of the mean and standard deviation.

### Age bands from date of birth {easy}

Compute each patient's age in whole years as of a reference date, then bucket it into `0–17`, `18–39`, `40–64` and `65+`
for a report.

#### Hints

1. Age in years isn't `days // 365`, because of leap years. Subtract the years, then subtract 1 if the birthday hasn't
   happened yet this year.
2. `pd.cut(age, bins=[0, 18, 40, 65, np.inf], right=False, labels=[...])` makes left-closed bins: [0, 18), [18, 40), and so on.
3. The result is a `category` column, and it sorts in band order.

#### Solution

Compute the exact age with vectorised date parts, then bin with `pd.cut`. `right=False` puts an 18-year-old in `18–39`,
not `0–17`.

```python
import numpy as np
import pandas as pd

patients = pd.DataFrame({"dob": pd.to_datetime(["2010-10-14", "2008-10-13", "1985-03-07", "1961-10-12", "1990-12-31"])})
ref = pd.Timestamp("2026-10-13")

had_birthday = (patients["dob"].dt.month < ref.month) | (
    (patients["dob"].dt.month == ref.month) & (patients["dob"].dt.day <= ref.day)
)
patients["age"] = ref.year - patients["dob"].dt.year - (~had_birthday).astype(int)
patients["band"] = pd.cut(patients["age"], bins=[0, 18, 40, 65, np.inf], right=False,
                          labels=["0-17", "18-39", "40-64", "65+"])

assert patients["age"].tolist() == [15, 18, 41, 65, 35]
assert patients["band"].astype(str).tolist() == ["0-17", "18-39", "40-64", "65+", "18-39"]
assert patients["band"].value_counts().sort_index().tolist() == [1, 2, 1, 1]
```

The first patient turns 16 tomorrow, so they're still 15. The second turns 18 exactly on the reference date.

Complexity: O(n).

#### Follow-ups

- **Equal-sized groups instead of fixed edges?** `pd.qcut(age, q=4)` makes quartiles.
- **Age is PHI?** Under HIPAA Safe Harbor, ages over 89 must be grouped as "90 or older". Bins like these help de-identify data.

### Standardise features and compute pairwise distances with NumPy {medium}

Given a matrix `X` (rows are patients, columns are features), standardise each column to mean 0 and standard deviation 1
without loops. Then compute the matrix of Euclidean distances between every pair of patients, also without loops.

#### Hints

1. `X.mean(axis=0)` and `X.std(axis=0)` give one value per column, and broadcasting applies them to every row.
2. For pairwise differences, add axes: `X[:, None, :] - X[None, :, :]` has shape (n, n, features).
3. Square, sum over the last axis, then take the square root.

#### Solution

Broadcasting replaces both loops. The distance step builds an n × n × f array, which is fine for small n. For large n,
use the identity ‖a − b‖² = ‖a‖² + ‖b‖² − 2a·b, or `scipy.spatial.distance.cdist`.

```python
import numpy as np

X = np.array([
    [50.0, 120.0],   # age, systolic blood pressure
    [60.0, 140.0],
    [70.0, 160.0],
])
Z = (X - X.mean(axis=0)) / X.std(axis=0)
assert np.allclose(Z.mean(axis=0), 0) and np.allclose(Z.std(axis=0), 1)

diff = X[:, None, :] - X[None, :, :]         # shape (3, 3, 2)
D = np.sqrt((diff ** 2).sum(axis=-1))
assert D.shape == (3, 3)
assert np.allclose(D, D.T) and np.allclose(np.diag(D), 0)
assert np.isclose(D[0, 1], np.hypot(10, 20))

# The memory-friendly identity gives the same answer.
sq = (X ** 2).sum(axis=1)
D2 = np.sqrt(np.maximum(sq[:, None] + sq[None, :] - 2 * X @ X.T, 0))
assert np.allclose(D, D2)
```

Complexity: O(n² × f) time. The broadcast version uses O(n² × f) memory, and the identity version uses O(n²).

#### Follow-ups

- **Why standardise before computing distances?** Otherwise the feature with the biggest units dominates. Blood pressure
  differences of 20 swamp age differences of 10. kNN, k-means and SVMs all need scaled features.
- **`np.std` vs `pandas.std`?** NumPy defaults to the population standard deviation (`ddof=0`) and pandas to the sample
  standard deviation (`ddof=1`). Results differ on small data.

### Paid amount by provider specialty, with unknown providers {medium}

Join claims to a provider directory on NPI and total the paid amount per specialty. Claims whose NPI isn't in the
directory must show up under `"Unknown"`, not disappear. Guard against a directory with duplicate NPIs.

#### Hints

1. An inner join would silently drop the claims with an unknown NPI. Use `how="left"`.
2. Fill the missing specialty with `"Unknown"` after the join.
3. `validate="many_to_one"` raises if the directory has duplicate NPIs, which would double-count claims.

#### Solution

Left join, fill, group. Checking the row count before and after the join is a habit interviewers notice.

```python
import pandas as pd

claims = pd.DataFrame({
    "claim_id": [1, 2, 3, 4, 5],
    "npi": ["111", "222", "111", "999", "222"],
    "paid": [100.0, 250.0, 50.0, 80.0, 25.0],
})
providers = pd.DataFrame({"npi": ["111", "222", "333"], "specialty": ["Cardiology", "Oncology", "Pediatrics"]})

joined = claims.merge(providers, on="npi", how="left", validate="many_to_one")
assert len(joined) == len(claims)
joined["specialty"] = joined["specialty"].fillna("Unknown")

by_specialty = joined.groupby("specialty")["paid"].sum().sort_values(ascending=False)
assert by_specialty.to_dict() == {"Oncology": 275.0, "Cardiology": 150.0, "Unknown": 80.0}
assert by_specialty.sum() == claims["paid"].sum()   # nothing lost, nothing double-counted
```

Complexity: O(n + m) for the hash join, plus O(n) for the group-by.

#### Follow-ups

- **Specialties with zero claims (Pediatrics)?** Join the other way round (providers left, claims right) or reindex the
  result onto every specialty with `fill_value=0`.
- **NPIs stored as numbers on one side and strings on the other?** The join silently matches nothing. Check the dtypes
  and cast both keys to the same type first. Leading zeros make string the safer choice.
