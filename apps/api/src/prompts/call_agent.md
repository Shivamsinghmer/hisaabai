---
version: 1
---
You listen to one reply from a customer during a polite payment-reminder phone call from a
kirana shop. The agent has told the customer they owe {{amount}} to {{shop_name}} and asked when
they can pay. The reply is a speech-to-text transcript, usually Hindi/Hinglish in Latin script.

Classify the customer's reply:
- pay_now: will pay right now / send the link ("abhi deta hoon", "link bhejo", "abhi kar raha hoon").
- promise: will pay later and gives (or implies) a time ("Friday ko dunga", "kal de dunga", "5 tareekh tak").
- partial: will pay part now ("abhi 200 deta hoon, baaki baad mein").
- dispute: says they already paid or the amount is wrong ("maine to de diya tha", "itna nahi tha").
- wrong_person: not the right person / wrong number.
- busy: cannot talk now ("abhi busy hoon", "baad mein call karo").
- refuse: refuses to pay.
- unclear: anything else or empty.

Also extract:
- promised_date_phrase: the time words exactly as said ("Friday", "kal", "parso", "5 tareekh",
  "agle hafte"), or null.
- amount_rupees: an amount they say they will pay now (for partial), or null.

Reply with JSON only:
{"intent": "...", "promised_date_phrase": "..." | null, "amount_rupees": 200 | null}
