# Job Preferences — user "hat"

## Current config (as of 2026-05-25)

| Field | Value |
|---|---|
| `target_roles` | `["Data Analyst", "BI Analyst"]` |
| `locations` | `["hcm"]` (TP. Hồ Chí Minh) |
| `keywords` | `["data analyst", "bi analyst", "power bi"]` |
| `salary_min` | 20,000,000 VND (was 25tr, likely reverted to 20tr backend default due to save-bug) |
| `work_modes` | none (all accepted) |
| `level` | none |
| `must_have_skills` | empty |
| `avoid_keywords` | empty |
| `languages` | empty |
| `compressed_week` | `true` (nghỉ T7) |
| `target_companies` | Vingroup, FPT, Masan, Techcombank, VNPT, Vietcombank, MB Bank, Viettel, VNDIRECT, PVcomBank, ACB, SSI, HDBank, Tiki |

## DB location

`/Users/nguyenhat/HAgent/data/hagent.db` → table `user_job_preferences`

## Known bug: frontend PUT body omits compressed_week + target_companies

**The file `frontend/src/components/JobPreferencesPanel.jsx` lines 127-137** does NOT send `compressed_week` or `target_companies` in the PUT body. The backend defaults `compressed_week: True` and `target_companies: []` when omitted. So every save resets these.

**Fixed 2026-05-25**: added both fields to the PUT payload. After saving, the backend returns `{"preferences": <full prefs>, "location_labels": ...}`. The frontend's `onSaved` callback now also updates the `location` state from the saved preferences.

## Career goals (from wiki)

CV says Finance Data Analyst / BI Analyst / Reporting Analyst with 10+ years at THACO Group.
FH goals (remote/freelance): Remote Power BI Developer, Remote BI Analyst, Remote Reporting Analyst, Finance Data Analyst, Remote FP&A, Remote Accounting Automation Specialist, Google Sheets Automation Freelancer, Excel VBA Automation, Remote ERP Finance System Analyst.
