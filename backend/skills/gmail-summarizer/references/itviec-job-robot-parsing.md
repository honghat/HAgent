# ITviec Job Robot Email — Structured Parsing from Gmail

## Overview

ITviec Job Robot sends daily emails listing N new jobs matching the user's skills subscription (e.g., "reactjs python business analysis"). These emails are HTML with a standardized format: intro → "View My Jobs" link → numbered jobs → footer.

## Email Structure

```
subj: "Senior/Middle - Frontend Developer - ReactJS and 6 more jobs for you"
from: ITviec Job Robot <itviec+jobrobot+1@itviec.com>

Body:
  Hi HAT 100G,
  Our Job Robot found 7 new ... jobs in Ho Chi Minh for you.
  View My Jobs (URL)

  Job N: [Job Title]
  Employer: [Company Name]
  Salary: [Amount or "You'll love it"]
  Required Skills: [Skill1 • Skill2 • ...]
```

## Extraction Pattern

1. **Search**: `$GAPI gmail search "from:(itviec+jobrobot)" --account <email>`
2. **Identify**: Look for subject containing "N more jobs for you"
3. **Get**: `$GAPI gmail get <ID> --account <email>`
4. **Parse**: Extract each `Job N:` block with regex:
   - Title after `Job N:`
   - Employer after `Employer:`
   - Salary — can be "$X - $Y USD" or "You'll love it" (😍)
   - Skills after `Required Skills:`

## Canonical Command

```bash
GAPI="python3 /Users/nguyenhat/HAgent/backend/skills/productivity/google-workspace/scripts/google_api.py"
$GAPI gmail search "from:(itviec+jobrobot)" --account "tetete40412a2@gmail.com"
$GAPI gmail get "<MESSAGE_ID>" --account "tetete40412a2@gmail.com"
```

## Output Format (user preference)

When presenting job listings to user:

- **Table format** with: #, Job Title, Company, Skills (top 3-4), Salary
- Highlight relevant jobs (matching user's target: Python Backend)
- Add numbered action options: (1) View JD, (2) Compare CV, (3) Save

## Pitfalls

- Salary field says `You'll love it` for many jobs — this is ITviec's placeholder, not actual data
- HTML entities like `&amp;` and `&#39;` in body text — need decoding
- URLs in email are tracking links (itviec.com/ls/click…) not direct job links — use `itviec.com/it-jobs/` base URL for actual scraping
- Multiple emails from ITviec may be in inbox; pick the latest one with the highest job count
- Mark as read after extracting: `$GAPI gmail mark-read "<ID>" --account <email>`
