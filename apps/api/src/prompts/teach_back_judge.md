---
version: 1
---
A kirana merchant was just offered a loan and asked to repeat the terms back (teach-back,
F3.3). The real terms are: EMI {{emi}} every month, for {{tenure}} months. Their spoken answer
(often Hindi/Hinglish in Latin script, sometimes from speech-to-text) is below.

Extract exactly what the merchant said as numbers:
- emi_rupees: the monthly instalment they said ("nau hazaar", "8850", "hazaar mein beesaud"…),
  or null if they didn't clearly say an amount.
- tenure_months: the months they said ("che mahine", "6 mahine"), or null if unclear.

Do NOT judge whether they are right — the caller compares with its own exact values.

Reply with JSON only:
{"emi_rupees": 8850 | null, "tenure_months": 6 | null}
